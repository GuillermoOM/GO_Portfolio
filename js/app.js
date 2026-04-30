import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { PortfolioApp } from "./state.js";
import { CRTShader } from "./shaders.js";
import { uiElements, setupUI, update_minimap } from "./ui.js";
import { load_map, initInstancedMeshes } from "./map.js";
import { size, min_zoom, max_zoom, rotation_speed, lerp_time } from "./constants.js";

export class AppController extends PortfolioApp {
  constructor() {
    super();
  }

  async init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    uiElements.container.appendChild(this.renderer.domElement);
    this.setup_camera();
    
    // Post-processing setup
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);
    
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.5, // strength
      0.4, // radius
      0.1  // threshold
    );
    this.composer.addPass(bloomPass);
    
    const crtPass = new ShaderPass(CRTShader);
    this.composer.addPass(crtPass);
  
    setupUI(this);
    
    this.mission_info = await fetch("/map_info.json")
      .then((response) => response.json());
      
    this.load_groups();
    load_map(this, this.mission_info.map_file);
    uiElements.map_img.setAttribute("src", this.mission_info.map_file);
    this.create_line();
    this.animate();
  }

  setup_camera() {
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      size * 2
    );
    this.camera.rotation.z = Math.PI;
    this.camera.rotation.x = -Math.PI / 4;
    this.camera.rotateOnWorldAxis(
      new THREE.Vector3(0.0, 0.0, 1.0),
      THREE.MathUtils.degToRad(90)
    );
  }

  load_group_icons(group_info) {
    group_info.items.forEach((item) => {
      if (item.type == "AIR") this.airIconsData.push(item);
      else this.gndIconsData.push(item);
    });
  }

  load_groups() {
    const json_groups = this.mission_info.groups;
    for (const group in json_groups) {
      let div = document.createElement("div");
      div.id = group;
      div.className = "group_selection";
      div.innerText = json_groups[group].name.toUpperCase();
      uiElements.group_box.appendChild(div);
      this.load_group_icons(json_groups[group]);
    }
    initInstancedMeshes(this);
    uiElements.group_box.childNodes.forEach((element) => {
      element.addEventListener("mouseenter", (e) => this.highlightObjective(e));
      element.addEventListener("mouseout", () => this.removeHighlight());
      element.addEventListener("click", (e) => this.zoomObjective(e));
    });
  }

  create_line() {
    const points = [];
    points.push(new THREE.Vector3(0.0, 0.0, 0.0));
    points.push(new THREE.Vector3(0.0, 0.0, 0.0));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xffffff });
    this.line = new THREE.Line(geometry, material);
    this.scene.add(this.line);
  }

  highlightObjective(event) {
    if (uiElements.reset_view.style.visibility != "visible") {
      this.group_coordinates = this.mission_info.groups[event.target.id].coordinates;
      this.map_mesh.material.uniforms.selection = {
        value: true,
      };
      const obj_coord = new THREE.Vector3(
        this.group_coordinates[0],
        this.group_coordinates[1],
        this.group_coordinates[2]
      );
      this.map_mesh.material.uniforms.highlight_zone = {
        value: obj_coord,
      };
      const rect = event.target.getBoundingClientRect();
      this.screenX = rect.right;
      this.screenY = rect.y + rect.height / 2;
      this.highlighted = true;
    }
  }

  removeHighlight() {
    this.map_mesh.material.uniforms.selection = {
      value: false,
    };
    this.highlighted = false;
  }

  zoomObjective(event) {
    uiElements.group_info_box.textContent = "";
    let div_name = document.createElement("div");
    div_name.className = "info_name";
    div_name.textContent =
      this.mission_info.groups[event.target.id].name.toUpperCase();
    uiElements.group_info_box.appendChild(div_name);
  
    let coord_div = document.createElement("div");
    coord_div.className = "info_item_coords";
    coord_div.innerText =
      "[ " + this.mission_info.groups[event.target.id].coordinates + " ]";
    uiElements.group_info_box.appendChild(coord_div);
  
    let group_items = this.mission_info.groups[event.target.id].items;
    for (const item in group_items) {
      let div_item_name = document.createElement("div");
      div_item_name.className = "info_item_name";
      div_item_name.innerText = group_items[item].name.toUpperCase();
      div_item_name.style.color =
        "rgba(".concat(
          group_items[item].color[0],
          ",",
          group_items[item].color[1],
          ",",
          group_items[item].color[2]
        ) + ")";
      uiElements.group_info_box.appendChild(div_item_name);
  
      let div_desc = document.createElement("div");
      div_desc.className = "info_item_desc";
      div_desc.innerHTML = group_items[item].description;
      uiElements.group_info_box.appendChild(div_desc);
    }
  
    this.group_coordinates = this.mission_info.groups[event.target.id].coordinates;
    
    // Copy the current position BEFORE mutating the camera_target
    this.zoom_start_pos.copy(this.lerp_position);
    
    this.camera_target.x = this.group_coordinates[0];
    this.camera_target.y = this.group_coordinates[1];
    this.camera_target.z = this.group_coordinates[2] + max_zoom;
    
    if (this.zoomingOut || this.zoomingIn) {
      this.lerp_clock.stop();
    }
    
    this.map_mesh.material.uniforms.selection = {
      value: false,
    };
    this.highlighted = false;
    this.zoomingIn = true;
    this.lerp_clock.start();
    uiElements.group_info_box.style.visibility = "visible";
    uiElements.reset_view.style.visibility = "visible";
    uiElements.about.style.visibility = "hidden";
    uiElements.about_button.style.visibility = "hidden";
  }

  update_camera() {
    const time = this.camera_clock.getElapsedTime();
    const new_orbit_pos = new THREE.Vector2(
      Math.sin(time * rotation_speed),
      Math.cos(time * rotation_speed)
    );
    const angle = this.old_orbit_pos.angleTo(new_orbit_pos);
    this.old_orbit_pos = new_orbit_pos;
  
    if (this.zoomingIn || this.zoomingOut) {
      let lerp_elapsed_time = this.lerp_clock.getElapsedTime();
      if (lerp_elapsed_time < lerp_time * 15) {
        this.lerp_move_perc = THREE.MathUtils.mapLinear(
          lerp_elapsed_time,
          0,
          lerp_time * 15,
          0.0,
          1.0
        );
        this.lerp_position = this.zoom_start_pos.lerp(this.camera_target, this.lerp_move_perc);
      } else {
        this.zoomingIn = false;
        this.zoomingOut = false;
        this.lerp_clock.stop();
      }
    } else {
      this.lerp_position = this.camera_target;
    }
    this.camera.position.x = new_orbit_pos.x * this.lerp_position.z + this.lerp_position.x;
    this.camera.position.y = new_orbit_pos.y * this.lerp_position.z + this.lerp_position.y;
    this.camera.position.z = this.lerp_position.z;
    this.camera.rotateOnWorldAxis(new THREE.Vector3(0.0, 0.0, 1.0), -angle);
    update_minimap(this, this.lerp_position.x, this.lerp_position.y, this.lerp_position.z);
  }

  update_shaders() {
    this.map_mesh.material.uniforms.current_range = {
      value: this.lerp_position.z,
    };
    this.map_mesh.material.uniforms.zone = {
      value: new THREE.Vector2(this.lerp_position.x, this.lerp_position.y),
    };
    this.map_mesh.material.uniforms.zoom = {
      value: min_zoom / this.lerp_position.z,
    };
    
    this.airIconsData.forEach((item, i) => {
      if (
        item.coordinates[0] > this.lerp_position.x - this.lerp_position.z &&
        item.coordinates[0] < this.lerp_position.x + this.lerp_position.z &&
        item.coordinates[1] > this.lerp_position.y - this.lerp_position.z &&
        item.coordinates[1] < this.lerp_position.y + this.lerp_position.z
      ) {
        this.airMesh.setColorAt(i, new THREE.Color(item.color[0]/255, item.color[1]/255, item.color[2]/255));
      } else {
        this.airMesh.setColorAt(i, new THREE.Color(0, 0, 0));
      }
    });
    if (this.airMesh) this.airMesh.instanceColor.needsUpdate = true;
    
    this.gndIconsData.forEach((item, i) => {
      if (
        item.coordinates[0] > this.lerp_position.x - this.lerp_position.z &&
        item.coordinates[0] < this.lerp_position.x + this.lerp_position.z &&
        item.coordinates[1] > this.lerp_position.y - this.lerp_position.z &&
        item.coordinates[1] < this.lerp_position.y + this.lerp_position.z
      ) {
        this.gndMesh.setColorAt(i, new THREE.Color(item.color[0]/255, item.color[1]/255, item.color[2]/255));
      } else {
        this.gndMesh.setColorAt(i, new THREE.Color(0, 0, 0));
      }
    });
    if (this.gndMesh) this.gndMesh.instanceColor.needsUpdate = true;
  }

  update_objective_line(screenX, screenY, WorldX, WorldY, WorldZ) {
    if (this.highlighted) {
      const ndcX = (screenX / window.innerWidth) * 2 - 1;
      const ndcY = -(screenY / window.innerHeight) * 2 + 1;
      const ndcZ = 1.0;
  
      const ndcVector = new THREE.Vector3(ndcX, ndcY, ndcZ);
  
      const cameraSpaceVector = ndcVector
        .clone()
        .applyMatrix4(this.camera.projectionMatrixInverse);
  
      const worldSpaceVector = cameraSpaceVector
        .clone()
        .applyMatrix4(this.camera.matrixWorld);
  
      const newPositions = new Float32Array([
        worldSpaceVector.x,
        worldSpaceVector.y,
        worldSpaceVector.z,
        WorldX,
        WorldY,
        WorldZ,
      ]);
  
      this.line.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(newPositions, 3)
      );
      this.line.geometry.attributes.position.needsUpdate = true;
    } else {
      this.line.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(
          new Float32Array([
            0,
            0,
            0,
            0,
            0,
            0,
          ]),
          3
        )
      );
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.update_camera();
    this.update_objective_line(
      this.screenX,
      this.screenY,
      this.group_coordinates[0],
      this.group_coordinates[1],
      this.group_coordinates[2]
    );
    this.update_shaders();
    
    if (this.composer.passes.length > 2) {
      this.composer.passes[2].uniforms["time"].value = this.camera_clock.getElapsedTime();
    }
    
    this.composer.render();
  }
}
