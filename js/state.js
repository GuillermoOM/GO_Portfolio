import * as THREE from "three";
import { size, min_zoom } from "./constants.js";

export class PortfolioApp {
  constructor() {
    this.camera = null;
    this.map_mesh = null;
    this.line = null;
    this.mission_info = null;
    this.composer = null;
    this.renderer = new THREE.WebGLRenderer();
    this.scene = new THREE.Scene();
    this.loader = new THREE.TextureLoader();
    this.camera_clock = new THREE.Clock();
    this.lerp_clock = new THREE.Clock();
    this.zoomingIn = false;
    this.zoomingOut = false;
    this.screenX = 0.0;
    this.screenY = 0.0;
    this.lerp_move_perc = 0.0;
    this.group_coordinates = [0.0, 0.0, 0.0];
    this.camera_target = new THREE.Vector3(0.0, 0.0, min_zoom);
    this.lerp_position = new THREE.Vector3(0.0, 0.0, min_zoom);
    this.zoom_start_pos = new THREE.Vector3(0.0, 0.0, min_zoom);
    this.old_orbit_pos = new THREE.Vector2(0.0, 0.0);
    this.highlighted = false;
    this.airIconsData = [];
    this.gndIconsData = [];
    this.airMesh = null;
    this.gndMesh = null;
    this.dummy = new THREE.Object3D();
  }
}
