import * as THREE from "three";
import { PortfolioApp } from "./state.js";

export const uiElements = {
  container: document.getElementById("container"),
  reset_view: document.getElementById("reset_view"),
  group_box: document.getElementById("groups"),
  group_info_box: document.getElementById("group_info"),
  map_img: document.getElementById("map_img"),
  map_zoom_zone: document.getElementById("map_zoom_zone"),
  map_x_axis: document.getElementById("map_x_axis"),
  map_y_axis: document.getElementById("map_y_axis"),
  about_button: document.getElementById("about_button"),
  about: document.getElementById("about"),
  close_about: document.getElementById("close_modal"),
};

export function setupUI(app) {
  uiElements.reset_view.addEventListener("click", () => resetZoom(app));
  uiElements.close_about.addEventListener("click", hide_about);
  uiElements.about_button.addEventListener("click", show_about);
  window.addEventListener("resize", () => onWindowResize(app));
}

export function hide_about() {
  uiElements.about.style.visibility = "hidden";
  uiElements.about_button.style.visibility = "visible";
}

export function show_about() {
  uiElements.about.style.visibility = "visible";
  uiElements.about_button.style.visibility = "hidden";
}

export function resetZoom(app) {
  // Copy the current position BEFORE mutating the camera_target
  app.zoom_start_pos.copy(app.lerp_position);
  
  app.camera_target.x = 0.0;
  app.camera_target.y = 0.0;
  app.camera_target.z = 665.6; // min_zoom value from constants.js (size * 0.65 = 1024 * 0.65 = 665.6)
  
  if (app.zoomingOut || app.zoomingIn) {
    app.lerp_clock.stop();
  }

  app.zoomingOut = true;
  app.lerp_clock.start();
  uiElements.reset_view.style.visibility = "hidden";
  uiElements.group_info_box.style.visibility = "hidden";
  if (uiElements.about_button.style.visibility == "hidden"){
    uiElements.about_button.style.visibility = "visible";
  }
}

export function update_minimap(app, x, y, zoom) {
  let map_x = THREE.MathUtils.mapLinear(x, -1024 / 2, 1024 / 2, 0, 100);
  let map_y = THREE.MathUtils.mapLinear(y, -1024 / 2, 1024 / 2, 100, 0);
  let box_size = THREE.MathUtils.mapLinear(zoom, 0, 665.6, 0, 100);
  uiElements.map_x_axis.style.left = map_x + "%";
  uiElements.map_y_axis.style.top = map_y + "%";
  uiElements.map_zoom_zone.style.width = box_size + "%";
  uiElements.map_zoom_zone.style.height = box_size + "%";
  uiElements.map_zoom_zone.style.left = map_x - box_size / 2 + "%";
  uiElements.map_zoom_zone.style.top = map_y - box_size / 2 + "%";
}

export function onWindowResize(app) {
  app.camera.aspect = window.innerWidth / window.innerHeight;
  app.camera.updateProjectionMatrix();
  app.renderer.setSize(window.innerWidth, window.innerHeight);
  app.composer.setSize(window.innerWidth, window.innerHeight);
}
