import * as THREE from "three";
import { size, resolution } from "./constants.js";
import { getMapMaterial, iconMaterial } from "./shaders.js";

export function load_map(app, map_file) {
  let map_heightMap = app.loader.load(map_file);
  const map_geometry = new THREE.PlaneGeometry(
    size,
    size,
    resolution,
    resolution
  );

  const map_material = getMapMaterial(map_heightMap);
  app.map_mesh = new THREE.Points(map_geometry, map_material);
  app.scene.add(app.map_mesh);
}

export function initInstancedMeshes(app) {
  const airGeom = new THREE.ConeGeometry(5.0, 15.0, 3);
  airGeom.rotateX(Math.PI / 2);
  const gndGeom = new THREE.BoxGeometry(5.0, 5.0, 5.0);
  
  app.airMesh = new THREE.InstancedMesh(airGeom, iconMaterial, app.airIconsData.length);
  app.gndMesh = new THREE.InstancedMesh(gndGeom, iconMaterial, app.gndIconsData.length);
  
  app.airIconsData.forEach((item, i) => {
    app.dummy.position.set(item.coordinates[0], item.coordinates[1], item.coordinates[2]);
    if (item.heading) {
      app.dummy.lookAt(new THREE.Vector3(item.heading[0], item.heading[1], item.heading[2]));
    } else {
      app.dummy.rotation.set(0,0,0);
    }
    app.dummy.updateMatrix();
    app.airMesh.setMatrixAt(i, app.dummy.matrix);
    app.airMesh.setColorAt(i, new THREE.Color(item.color[0]/255, item.color[1]/255, item.color[2]/255));
  });
  
  app.gndIconsData.forEach((item, i) => {
    app.dummy.position.set(item.coordinates[0], item.coordinates[1], item.coordinates[2]);
    if (item.heading) {
      app.dummy.lookAt(new THREE.Vector3(item.heading[0], item.heading[1], item.heading[2]));
    } else {
      app.dummy.rotation.set(0,0,0);
    }
    app.dummy.updateMatrix();
    app.gndMesh.setMatrixAt(i, app.dummy.matrix);
    app.gndMesh.setColorAt(i, new THREE.Color(item.color[0]/255, item.color[1]/255, item.color[2]/255));
  });
  
  app.scene.add(app.airMesh);
  app.scene.add(app.gndMesh);
}
