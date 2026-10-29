import * as THREE from 'three';

// The street grid is fixed in world space. A chunk owns four 18 m blocks.
const CHUNK = 36;
const RADIUS = 2;
const PALETTE = [0x426278, 0x414b68, 0x51435d, 0x435b72, 0x355064];
const ACCENTS = [0x51e9f0, 0xff589f, 0xf9be68, 0x9a89ff];

export function createCityWorld(scene, { seed = 2418, density = .72 } = {}) {
  let worldSeed = seed;
  let fill = density;
  let centerX = NaN;
  let centerZ = NaN;
  const chunks = new Map();
  const root = new THREE.Group();
  root.name = 'Streamed city neighborhoods';
  scene.add(root);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const solidMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: .53, metalness: .32,
  });
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  lightMaterial.color.setScalar(3);
  const haloCanvas = document.createElement('canvas');
  haloCanvas.width = haloCanvas.height = 128;
  const haloContext = haloCanvas.getContext('2d');
  const gradient = haloContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255,255,255,.7)');
  gradient.addColorStop(.25, 'rgba(255,255,255,.4)');
  gradient.addColorStop(.6, 'rgba(255,255,255,.12)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  haloContext.fillStyle = gradient;
  haloContext.fillRect(0, 0, 128, 128);
  const haloTexture = new THREE.CanvasTexture(haloCanvas);
  const haloMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff, map: haloTexture, transparent: true, opacity: .48,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const labels = [['PAC', 'ZONE', '#55eafa'], ['GHOST', 'CLUB', '#ff6aaf'], ['24 H', 'ARCADE', '#ffca70'], ['NEON', 'MARKET', '#b6a7ff']];
  labels.forEach(([a, b, color], i) => {
    const x = i * 256;
    ctx.fillStyle = '#111e30'; ctx.fillRect(x, 0, 256, 256);
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.strokeRect(x + 10, 10, 236, 236);
    ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.font = 'bold 49px monospace';
    ctx.fillText(a, x + 128, 103); ctx.font = 'bold 37px monospace'; ctx.fillText(b, x + 128, 159);
    ctx.shadowBlur = 0; ctx.font = '15px monospace'; ctx.fillText('OPEN · ALL NIGHT', x + 128, 209);
  });
  const signTexture = new THREE.CanvasTexture(canvas);
  signTexture.colorSpace = THREE.SRGBColorSpace;
  signTexture.anisotropy = 4;
  const signMaterial = new THREE.MeshBasicMaterial({ map: signTexture, toneMapped: false, side: THREE.DoubleSide });
  const transform = new THREE.Object3D();
  const color = new THREE.Color();

  function random(x, z, salt = 0) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(worldSeed | 0, 1442695041) ^ Math.imul(salt, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function makeChunk(cx, cz) {
    const group = new THREE.Group();
    group.position.set(cx * CHUNK, 0, cz * CHUNK);
    group.name = `District ${cx},${cz}`;
    const solids = [], lights = [], halos = [], signVertices = [], signUVs = [];
    let buildings = 0;
    const put = (list, x, y, z, w, h, d, tint, rot = 0) => list.push([x, y, z, w, h, d, tint, rot]);
    const box = (x, y, z, w, h, d, tint) => put(solids, x, y, z, w, h, d, tint);
    const glow = (x, y, z, w, h, d, tint) => put(lights, x, y, z, w, h, d, tint);
    const halo = (x, z, w, d, tint) => put(halos, x, .035, z, w, 1, d, tint);
    const sign = (x, y, z, w, h, type, rotation = 0) => {
      const corners = [[-w/2,-h/2], [w/2,-h/2], [w/2,h/2], [-w/2,h/2]];
      const indices = [0,1,2,0,2,3], uvs = [[0,0],[1,0],[1,1],[0,1]];
      for (const index of indices) {
        const [px, py] = corners[index];
        signVertices.push(x + px * Math.cos(rotation), y + py, z - px * Math.sin(rotation));
        signUVs.push((type + .02 + uvs[index][0] * .96)/4, .02 + uvs[index][1] * .96);
      }
    };

    // Slightly reflective asphalt, raised sidewalks, understated lane markings.
    box(18, -.19, 18, 36, .35, 36, 0x131d2a);
    for (let road = 0; road <= 36; road += 18) {
      for (let dash = 3.7; dash < 36; dash += 4.5) {
        if (Math.abs((dash % 18) - 9) > 5) continue;
        glow(road, .008, dash, .055, .015, 1.6, 0x50627a);
        glow(dash, .008, road, 1.6, .015, .055, 0x50627a);
      }
    }
    for (let bx = 0; bx < 2; bx++) for (let bz = 0; bz < 2; bz++) {
      const x = 9 + bx*18, z = 9 + bz*18;
      const wx = cx*2 + bx, wz = cz*2 + bz;
      const rr = salt => random(wx, wz, salt);
      const accent = ACCENTS[Math.floor(rr(1)*4)];
      box(x,.12,z,13.8,.24,13.8,0x2d3947);
      box(x,.25,z,12.9,.04,12.9,0x26313e);
      // Crossing stripes occupy the road, outside the building envelope.
      for (let s = -2; s <= 2; s++) {
        box(x-7.55,.018,z+7.9+s*.41,.75,.022,.18,0x647487);
        box(x+7.9+s*.41,.018,z-7.55,.18,.022,.75,0x647487);
      }
      for (const [lx,lz] of [[x-6.5,z-6.5],[x+6.5,z+6.5]]) {
        box(lx,1.8,lz,.1,3.6,.1,0x526274);
        box(lx+.4,3.6,lz,.9,.12,.3,0x3b4b5c);
        glow(lx+.4,3.52,lz,.7,.06,.22,accent);
        halo(lx,lz,2.6,3.1,accent);
      }

      const isPlaza = rr(2) > fill || (wx === 0 && wz === 0);
      if (isPlaza) {
        // Pocket plazas keep the street-level life readable between towers.
        box(x,.38,z,5.1,.3,5.1,0x192837);
        box(x,.55,z,3.4,.2,3.4,0x34475c);
        for (const s of [-1,1]) {
          glow(x+s*2.25,.56,z,.08,.04,4.6,accent);
          glow(x,.56,z+s*2.25,4.6,.04,.08,accent);
          box(x+s*4.5,.65,z,1.2,.35,3.3,0x5b6175);
          box(x+s*4.5,.28,z-1,.2,.5,.4,0x152331);
          box(x+s*4.5,.28,z+1,.2,.5,.4,0x152331);
        }
        box(x,1.3,z,.9,1.3,.9,0x2d4056);
        glow(x,2.05,z,1.3,.12,1.3,accent);
        box(x-4,.9,z-4,1.5,1.5,1,0x293a50);
        sign(x-4,1,z-3.48,1.1,1.1,Math.floor(rr(3)*4));
        halo(x,z,8,8,accent);
        continue;
      }
      buildings++;
      const nearCenter = Math.hypot(wx+.5,wz+.5) < 2.5;
      const height = 5 + Math.pow(rr(4), 1.1) * (nearCenter ? 10 : 25);
      const width = 7.2 + rr(5)*3.6, depth = 6.8 + rr(6)*3.7;
      const bodyColor = PALETTE[Math.floor(rr(7)*PALETTE.length)];
      const stepped = rr(8) > .45 && height > 10;
      const podiumHeight = stepped ? height*.45 : height;
      box(x,podiumHeight/2+.26,z,width,podiumHeight,depth,bodyColor);
      let upperWidth=width, upperDepth=depth;
      if (stepped) {
        upperWidth=width*.72; upperDepth=depth*.76;
        box(x,(height+podiumHeight)/2+.26,z,upperWidth,height-podiumHeight,upperDepth,bodyColor);
        box(x,podiumHeight+.27,z,width+.25,.14,depth+.25,0x425267);
        glow(x,podiumHeight+.36,z+depth/2,.02+width,.045,.08,accent);
      }
      // Recessed wall panels, structural ribs and a few restrained vertical
      // light fins break up the facades without adding any draw calls.
      box(x, podiumHeight/2+.26, z+depth/2+.007, width*.63, podiumHeight-.12, .018, 0x293c50);
      for (let rib=-width/2+.28; rib<width/2; rib+=2.44) {
        box(x+rib,podiumHeight/2+.26,z+depth/2+.065,.105,podiumHeight,.13,0x52667b);
      }
      for (let rib=-depth/2+.28; rib<depth/2; rib+=2.44) {
        box(x+width/2+.065,podiumHeight/2+.26,z+rib,.13,podiumHeight,.105,0x445a70);
      }
      if (stepped) {
        box(x+upperWidth/2+.015,(height+podiumHeight)/2+.26,z,.025,height-podiumHeight,upperDepth*.55,0x29394f);
      }
      if (height>11&&rr(12)>.38) {
        glow(x-width/2-.04,podiumHeight/2+.26,z+depth/2-.22,.07,podiumHeight-.5,.09,accent);
        if(stepped)glow(x+upperWidth/2+.04,(height+podiumHeight)/2+.26,z+upperDepth/2-.2,.07,height-podiumHeight,.09,accent);
      }
      // The roof has a solid cap and narrow light accents, not a glowing slab.
      box(x,height+.38,z,upperWidth+.18,.24,upperDepth+.18,0x526175);
      glow(x,height+.53,z+upperDepth/2,upperWidth,.06,.07,accent);
      glow(x+upperWidth/2,height+.53,z,.07,.06,upperDepth,accent);
      box(x-1,height+.82,z,.9,.7,1.8,0x677080);
      box(x+1,height+1.05,z+1,1.5,1.1,1.3,0x3c4a5d);
      for(let v=0;v<4;v++) box(x-1,height+1.18,z-.6+v*.4,.68,.035,.13,0x20303e);
      if (height>16) {
        box(x+.7,height+2.3,z-.7,.09,3.7,.09,0x607083);
        glow(x+.7,height+4.2,z-.7,.16,.14,.16,0xff456e);
      }
      // Horizontal floor reveals and irregular lit windows on all four faces.
      for(let y=2.8;y<height-.5;y+=1.8) {
        const upper=stepped&&y>podiumHeight;
        const w=upper?upperWidth:width, d=upper?upperDepth:depth;
        box(x,y-.59,z,w+.045,.07,d+.045,0x172535);
        for(let col=-w/2+.6, k=0;col<w/2-.4;col+=1.22,k++) {
          for(const face of [-1,1]) {
            const lit=random(wx*53+k,wz*59+Math.floor(y)*3,face+91);
            if(lit>.28) glow(x+col,y,z+face*(d/2+.028),.54,.72,.04,lit>.87?0xf4b875:accent);
          }
        }
        for(let col=-d/2+.6, k=0;col<d/2-.4;col+=1.22,k++) {
          for(const face of [-1,1]) {
            const lit=random(wx*67+k,wz*41+Math.floor(y)*3,face+161);
            if(lit>.31) glow(x+face*(w/2+.028),y,z+col,.04,.72,.54,lit>.86?0xf4b875:accent);
          }
        }
      }
      // Street-level shopfronts, canopy, wall signage and tiny service furniture.
      box(x,1.1,z+depth/2+.05,width*.65,1.55,.12,0x0d1b2a);
      for(const dx of [-width*.24,0,width*.24]) glow(x+dx,1.12,z+depth/2+.13,width*.19,1.12,.035,0x356d85);
      box(x,2,z+depth/2+.65,width*.78,.18,1.4,0x283b52);
      glow(x,1.92,z+depth/2+1.33,width*.78,.055,.06,accent);
      halo(x,z+depth/2+1, width*.75, 2.1, accent);
      sign(x,3.5,z+depth/2+.09,Math.min(3.2,width*.45),1.5,Math.floor(rr(9)*4));
      if(height>9&&rr(10)>.25) {
        box(x+width/2+.28,height*.55,z+depth/2-1.1,.5,3.3,1.6,0x162337);
        sign(x+width/2+.56,height*.55,z+depth/2-1.1,1.45,3.1,Math.floor(rr(11)*4),Math.PI/2);
      }
      box(x-width/2-.6,.7,z+depth/2-.8,.65,.9,.65,0x466070);
      glow(x-width/2-.6,1.17,z+depth/2-.8,.56,.04,.56,accent);
    }

    function batch(items, geometry, material, shadows) {
      if (!items.length) return;
      const mesh = new THREE.InstancedMesh(geometry, material, items.length);
      mesh.castShadow=shadows; mesh.receiveShadow=shadows;
      for (let i=0;i<items.length;i++) {
        const [x,y,z,w,h,d,tint,rot]=items[i];
        transform.position.set(x,y,z);transform.scale.set(w,h,d);transform.rotation.set(0,rot,0);transform.updateMatrix();
        mesh.setMatrixAt(i,transform.matrix);mesh.setColorAt(i,color.setHex(tint));
      }
      mesh.computeBoundingSphere(); group.add(mesh);
    }
    batch(solids,cube,solidMaterial,true);
    batch(lights,cube,lightMaterial,false);
    batch(halos,plane,haloMaterial,false);
    if(signVertices.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(signVertices,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(signUVs,2));
      geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,signMaterial);group.add(mesh);
    }
    group.userData.buildings=buildings;
    root.add(group);
    return group;
  }

  function removeChunk(key, group) {
    root.remove(group);
    group.traverse(object=>{
      // InstancedMesh.dispose releases per-instance GPU attributes, shared base
      // geometries and materials are kept until the whole world is disposed.
      if(object.isInstancedMesh)object.dispose();
      else if(object.geometry)object.geometry.dispose();
    });
    chunks.delete(key);
  }
  function update(x,z) {
    const nextX=Math.floor(x/CHUNK), nextZ=Math.floor(z/CHUNK);
    if(nextX===centerX&&nextZ===centerZ)return;
    centerX=nextX;centerZ=nextZ;
    for(const [key,group] of chunks) {
      const [cx,cz]=key.split(',').map(Number);
      if(Math.abs(cx-centerX)>RADIUS||Math.abs(cz-centerZ)>RADIUS)removeChunk(key,group);
    }
    for(let dz=-RADIUS;dz<=RADIUS;dz++)for(let dx=-RADIUS;dx<=RADIUS;dx++) {
      const cx=centerX+dx,cz=centerZ+dz,key=`${cx},${cz}`;
      if(!chunks.has(key))chunks.set(key,makeChunk(cx,cz));
    }
  }
  function regenerate(newSeed=worldSeed,newDensity=fill) {
    const x=Number.isFinite(centerX)?centerX*CHUNK:0,z=Number.isFinite(centerZ)?centerZ*CHUNK:0;
    worldSeed=newSeed;fill=THREE.MathUtils.clamp(newDensity,.1,1);
    for(const [key,group]of chunks)removeChunk(key,group);
    centerX=centerZ=NaN;update(x,z);
  }
  function setNeon(value) {
    const intensity=THREE.MathUtils.clamp(value,.1,2);
    lightMaterial.color.setScalar(intensity * 3);
    haloMaterial.opacity=.48*intensity;
  }
  function getStats(){return {chunks:chunks.size,buildings:[...chunks.values()].reduce((sum,g)=>sum+g.userData.buildings,0),seed:worldSeed};}
  function dispose(){for(const [key,group]of chunks)removeChunk(key,group);scene.remove(root);cube.dispose();plane.dispose();solidMaterial.dispose();lightMaterial.dispose();haloMaterial.dispose();haloTexture.dispose();signMaterial.dispose();signTexture.dispose();}
  update(0,0);
  return {update,regenerate,setNeon,dispose,getStats};
}
