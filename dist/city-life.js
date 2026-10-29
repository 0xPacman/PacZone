import * as THREE from 'three';

/** Lightweight inhabitants and traffic, sharing geometry and materials across the city. */
export function createCityLife(scene, { seed = 2418 } = {}) {
  const root = new THREE.Group();
  root.name = 'City inhabitants and air traffic';
  scene.add(root);
  const geometries = new Set();
  const materials = new Set();
  const geo = geometry => { geometries.add(geometry); return geometry; };
  const material = settings => {
    const m = new THREE.MeshStandardMaterial(settings);
    materials.add(m);
    return m;
  };
  const paint = (color, emissive = 0, intensity = 0) => material({
    color, emissive, emissiveIntensity: intensity, roughness: .32, metalness: .18,
  });
  const pacPaint = paint(0xffd33c, 0xe59b00, .32);
  const mouthPaint = paint(0x7b3a05);
  const darkPaint = paint(0x101427);
  const metalPaint = paint(0x627f96);
  const glassPaint = material({ color: 0x112a43, roughness: .12, metalness: .65 });
  const whitePaint = paint(0xf3f7ff, 0xc9e6ff, .13);
  const cyanPaint = paint(0x78f9ff, 0x26dfff, 2.5);
  const pinkPaint = paint(0xff9bc9, 0xff348d, 2);
  const amberPaint = paint(0xffddb1, 0xffad45, 2);
  const ghostPaints = [
    paint(0xf367af, 0x761837, .32),
    paint(0x65e0eb, 0x0a7b8b, .35),
    paint(0xb899ff, 0x492977, .35),
    paint(0xffaa70, 0x8f3815, .25),
  ];
  const cube = geo(new THREE.BoxGeometry(1, 1, 1));
  const eye = geo(new THREE.SphereGeometry(1, 10, 8));
  const droneBody = geo(new THREE.SphereGeometry(1, 14, 8));
  const rotorRing = geo(new THREE.TorusGeometry(.36, .045, 5, 16));
  rotorRing.rotateX(Math.PI / 2);
  const cap = geo(new THREE.CylinderGeometry(.15, .15, .08, 8));

  // A spherical Pac-Man with an actual closed wedge mouth, not a hollow sphere.
  function makePacGeometry(radius = .72, opening = .4) {
    const positions = [], normals = [], indices = [];
    const rings = 18, segments = 32;
    for (let i = 0; i <= rings; i++) {
      const a = Math.PI * i / rings;
      for (let j = 0; j <= segments; j++) {
        const b = opening + (Math.PI * 2 - opening * 2) * j / segments;
        const x = Math.cos(a), y = Math.sin(a) * Math.sin(b), z = Math.sin(a) * Math.cos(b);
        positions.push(x * radius, y * radius, z * radius);
        normals.push(x, y, z);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j, b = a + segments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
    const surfaceCount = indices.length;
    for (const phi of [opening, Math.PI * 2 - opening]) {
      const upper = phi === opening;
      const normal = new THREE.Vector3(0, upper ? -Math.cos(phi) : Math.cos(phi), upper ? Math.sin(phi) : -Math.sin(phi));
      const start = positions.length / 3;
      positions.push(0, 0, 0); normals.push(normal.x, normal.y, normal.z);
      for (let i = 0; i <= rings; i++) {
        const a = Math.PI * i / rings;
        positions.push(radius * Math.cos(a), radius * Math.sin(a) * Math.sin(phi), radius * Math.sin(a) * Math.cos(phi));
        normals.push(normal.x, normal.y, normal.z);
      }
      for (let i = 0; i < rings; i++) {
        if (upper) indices.push(start, start + i + 1, start + i + 2);
        else indices.push(start, start + i + 2, start + i + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    geometry.addGroup(0, surfaceCount, 0);
    geometry.addGroup(surfaceCount, indices.length - surfaceCount, 1);
    geometry.computeBoundingSphere();
    return geo(geometry);
  }
  const pacGeometry = makePacGeometry();
  const ghostGeometry = (() => {
    const positions = [], indices = [];
    const segments = 24, rings = 12;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const y = t * 1.36;
      const radius = y < .78 ? .59 + (1 - y / .78) * .04 : .59 * Math.sqrt(Math.max(0, 1 - Math.pow((y - .78) / .58, 2)));
      for (let j = 0; j <= segments; j++) {
        const a = j / segments * Math.PI * 2;
        const scallop = i === 0 ? .08 + .095 * Math.cos(a * 6) : 0;
        positions.push(Math.sin(a) * radius, y + scallop, Math.cos(a) * radius);
      }
    }
    for (let i = 0; i < rings; i++) for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j, b = a + segments + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geo(geometry);
  })();
  // Give the rounded ghost exterior both windings so the hem stays opaque at low camera angles.
  ghostPaints.forEach(m => m.side = THREE.DoubleSide);

  function part(group, geometry, mat, x, y, z, sx = 1, sy = sx, sz = sx) {
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    return mesh;
  }
  const rand = (i, salt = 0) => {
    const n = Math.sin(seed * .131 + i * 127.1 + salt * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  let citizens = [], drones = [], cars = [], desiredDrones = 8;
  let lastTime = null, currentTime = 0;
  let targetX = 0, targetZ = 0;

  function routeFor(i, x, z, category) {
    const spread = category === 'drone' ? 3 : 2;
    const ox = (Math.floor(rand(i, 1) * (spread * 2 + 1)) - spread) * 18;
    const oz = (Math.floor(rand(i, 2) * (spread * 2 + 1)) - spread) * 18;
    const width = (1 + Math.floor(rand(i, 3) * 2)) * 18;
    const depth = (1 + Math.floor(rand(i, 4) * 2)) * 18;
    return { x: Math.round(x / 18) * 18 + ox, z: Math.round(z / 18) * 18 + oz, width, depth };
  }
  function createCitizen(i) {
    const group = new THREE.Group();
    group.name = i % 2 ? 'Ghost resident' : 'Pac-Man resident';
    const ghost = i % 2 === 1;
    part(group, ghost ? ghostGeometry : pacGeometry, ghost ? ghostPaints[Math.floor(i / 2) % 4] : [pacPaint, mouthPaint], 0, ghost ? 0 : .7, 0);
    if (ghost) {
      for (const sign of [-1, 1]) {
        part(group, eye, whitePaint, sign * .235, .93, .49, .19, .23, .11);
        part(group, eye, darkPaint, sign * .235, .93, .592, .087, .117, .047);
      }
    } else {
      for (const sign of [-1, 1]) part(group, eye, darkPaint, sign * .32, 1.12, .39, .075, .11, .055);
    }
    root.add(group);
    const route = routeFor(i, targetX, targetZ, 'citizen');
    return { group, ghost, i, route, distance: rand(i, 7) * 2 * (route.width + route.depth), speed: .9 + rand(i, 8) * .8, lane: 1.65, heading: 0, phase: rand(i, 9) * 6.28 };
  }
  function createDrone(i) {
    const group = new THREE.Group(); group.name = 'Delivery drone';
    part(group, droneBody, metalPaint, 0, 0, 0, .58, .18, .36);
    part(group, cube, glassPaint, 0, .1, .14, .55, .16, .32);
    part(group, cube, cyanPaint, 0, -.17, .16, .45, .06, .15);
    const rotors = [];
    for (const x of [-.75, .75]) for (const z of [-.6, .6]) {
      const arm = part(group, cube, darkPaint, x / 2, 0, z / 2, Math.hypot(x, z), .08, .1);
      arm.rotation.y = -Math.atan2(z, x);
      part(group, rotorRing, metalPaint, x, .07, z);
      const rotor = part(group, cube, darkPaint, x, .07, z, .57, .025, .07);
      rotors.push(rotor);
    }
    part(group, cap, pinkPaint, 0, .23, -.1);
    root.add(group);
    const route = routeFor(i + 100, targetX, targetZ, 'drone');
    return { group, i: i + 100, route, distance: rand(i, 17) * 2 * (route.width + route.depth), speed: 3.5 + rand(i, 18) * 2, lane: 0, heading: 0, phase: i * 2, height: 9 + rand(i, 19) * 6, rotors };
  }
  function createCar(i) {
    const group = new THREE.Group(); group.name = 'Autonomous street cab';
    const carPaint = i % 2 ? metalPaint : ghostPaints[i % 4];
    part(group, cube, carPaint, 0, .42, 0, 1.3, .38, 2.3);
    part(group, cube, glassPaint, 0, .75, -.12, 1.05, .34, 1.25);
    part(group, cube, darkPaint, 0, .22, 0, 1.34, .25, 1.85);
    part(group, cube, amberPaint, 0, .47, 1.16, 1.1, .075, .04);
    part(group, cube, pinkPaint, 0, .47, -1.16, 1.05, .06, .04);
    root.add(group);
    const route = routeFor(i + 200, targetX, targetZ, 'drone');
    return { group, i: i + 200, route, distance: rand(i, 27) * 2 * (route.width + route.depth), speed: 2.8 + rand(i, 28) * 1.5, lane: -.65, heading: 0, phase: 0 };
  }
  function reset() {
    root.clear();
    citizens = Array.from({ length: 24 }, (_, i) => createCitizen(i));
    drones = Array.from({ length: desiredDrones }, (_, i) => createDrone(i));
    cars = Array.from({ length: 6 }, (_, i) => createCar(i));
    lastTime = null;
  }
  function move(entity, dt, category) {
    const { route, lane } = entity;
    const left = route.x + lane, near = route.z + lane;
    const width = route.width - 2 * lane, depth = route.depth - 2 * lane;
    entity.distance = (entity.distance + dt * entity.speed) % (2 * (width + depth));
    let d = entity.distance, x, z, angle;
    if (d < width) { x = left + d; z = near; angle = Math.PI / 2; }
    else if ((d -= width) < depth) { x = left + width; z = near + d; angle = 0; }
    else if ((d -= depth) < width) { x = left + width - d; z = near + depth; angle = -Math.PI / 2; }
    else { d -= width; x = left; z = near + depth - d; angle = Math.PI; }
    entity.group.position.x = x; entity.group.position.z = z;
    const turn = Math.atan2(Math.sin(angle - entity.heading), Math.cos(angle - entity.heading));
    entity.heading += turn * Math.min(1, dt * 9);
    entity.group.rotation.y = entity.heading;
    if (Math.hypot(x - targetX, z - targetZ) > 105) {
      entity.route = routeFor(entity.i, targetX, targetZ, category);
      entity.distance = rand(entity.i, 10) * (entity.route.width + entity.route.depth) * 2;
    }
  }
  reset();
  return {
    update(time, dt, x = 0, z = 0) {
      targetX = x; targetZ = z;
      const elapsed = lastTime === null ? 0 : Math.min(.08, Math.max(0, time - lastTime));
      lastTime = time; currentTime = time;
      for (const person of citizens) {
        move(person, elapsed, 'citizen');
        person.group.position.y = person.ghost ? .43 + Math.sin(time * 2.7 + person.phase) * .13 : .18 + Math.abs(Math.sin(time * 4 + person.phase)) * .07;
        if (!person.ghost) person.group.rotation.z = Math.sin(time * 4 + person.phase) * .045;
      }
      for (const drone of drones) {
        move(drone, elapsed, 'drone');
        drone.group.position.y = drone.height + Math.sin(time * 1.8 + drone.phase) * .25;
        drone.group.rotation.z = Math.sin(time * 2 + drone.phase) * .04;
        for (const rotor of drone.rotors) rotor.rotation.y = time * 65 + drone.phase;
      }
      for (const car of cars) { move(car, elapsed, 'car'); car.group.position.y = .14; }
    },
    setDroneCount(n) {
      desiredDrones = Math.max(0, Math.min(16, Math.round(n)));
      while (drones.length > desiredDrones) root.remove(drones.pop().group);
      while (drones.length < desiredDrones) drones.push(createDrone(drones.length));
    },
    regenerate(nextSeed) { seed = nextSeed; reset(); },
    getStats() { return { citizens: citizens.length, residents: citizens.length, drones: drones.length, cars: cars.length }; },
    dispose() {
      scene.remove(root); root.clear();
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
      citizens = []; drones = []; cars = [];
    },
  };
}
