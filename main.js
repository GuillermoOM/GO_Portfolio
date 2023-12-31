import * as THREE from "three";

// Constants
const resolution = 256;
const size = 1024;
const max_zoom = size * 0.15;
const min_zoom = size * 0.65;
const rotation_speed = 0.05;
const lerp_time = 0.5;

// Globals
let camera, map_mesh, line, mission_info;

// Inits
const container = document.getElementById("container");
const reset_view = document.getElementById("reset_view");
const group_box = document.getElementById("groups");
const group_info_box = document.getElementById("group_info");
const map_img = document.getElementById("map_img");
const map_zoom_zone = document.getElementById("map_zoom_zone");
const map_x_axis = document.getElementById("map_x_axis");
const map_y_axis = document.getElementById("map_y_axis");
const about_button = document.getElementById("about_button");
const about = document.getElementById("about");
const close_about = document.getElementById("close_modal");
const renderer = new THREE.WebGLRenderer();
const scene = new THREE.Scene();
const loader = new THREE.TextureLoader();
const camera_clock = new THREE.Clock();
const lerp_clock = new THREE.Clock();
let zoomingIn = false;
let zoomingOut = false;
let screenX = 0.0;
let screenY = 0.0;
let lerp_move_perc = 0.0;
let group_coordinates = [0.0, 0.0, 0.0];
let camera_target = new THREE.Vector3(0.0, 0.0, min_zoom);
let lerp_position = new THREE.Vector3(0.0, 0.0, min_zoom);
let zoom_start_pos = new THREE.Vector3(0.0, 0.0, min_zoom);
let old_orbit_pos = new THREE.Vector2(0.0, 0.0);
let highlighted = false;
let map_icons = {};

class MapIcon {
  constructor(type, color) {
    this.type = type;
    this.color = color;
    if (type == "AIR") {
      this.geometry = new THREE.BufferGeometry();
      this.vertices = new Float32Array([
        0.0,
        0.0,
        15.0, // 0
        0.0,
        -5.0,
        0.0, // 1
        -5.0,
        0.0,
        0.0, // 2
        5.0,
        0.0,
        0.0, // 3
      ]);

      const indices = [3, 1, 0, 3, 2, 1, 0, 2, 3, 0, 1, 2];
      this.geometry.setIndex(indices);
      this.geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(this.vertices, 3)
      );
    } else {
      this.geometry = new THREE.BoxGeometry(5.0, 5.0, 5.0);
    }

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        zone: { value: new THREE.Vector2(0.0, 0.0) },
        current_range: { value: size },
        color: {
          value: new THREE.Vector3(
            color[0] / 255,
            color[1] / 255,
            color[2] / 255
          ),
        },
      },
      vertexShader: `
        varying vec4 pos;
        
        void main()
        {
            pos = vec4(position, 1.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
        `,
      fragmentShader: `
        uniform float current_range;
        uniform vec2 zone;
        uniform vec3 color;

        varying vec4 pos;
        
        void main()
        { 
          gl_FragColor = vec4(color.x, color.y, color.z, 1.0);
        }
        `,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
  }
}

async function init() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);
  window.addEventListener("resize", onWindowResize);
  reset_view.addEventListener("click", resetZoom);
  close_about.addEventListener("click", hide_about);
  about_button.addEventListener("click", show_about);
  setup_camera();
  mission_info = await fetch("/map_info.json")
    .then((response) => response.json())
    .then((json) => {
      return json;
    });
  load_groups();
  load_map(mission_info.map_file);
  map_img.setAttribute("src", mission_info.map_file);
  create_line();
  animate();
}

function setup_camera() {
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    size * 2
  );
  camera.rotation.z = Math.PI;
  camera.rotation.x = -Math.PI / 4;
  camera.rotateOnWorldAxis(
    new THREE.Vector3(0.0, 0.0, 1.0),
    THREE.MathUtils.degToRad(90)
  );
}

function load_group_icons(group_info) {
  group_info.items.forEach((item) => {
    map_icons[item.name] = new MapIcon(item.type, item.color);
    scene.add(map_icons[item.name].mesh);
    map_icons[item.name].mesh.position.x = item.coordinates[0];
    map_icons[item.name].mesh.position.y = item.coordinates[1];
    map_icons[item.name].mesh.position.z = item.coordinates[2];
    if (item.heading) {
      map_icons[item.name].mesh.lookAt(
        new THREE.Vector3(item.heading[0], item.heading[1], item.heading[2])
      );
    }
  });
}

function load_groups() {
  const json_groups = mission_info.groups;
  for (const group in json_groups) {
    let div = document.createElement("div");
    div.id = group;
    div.className = "group_selection";
    div.innerText = json_groups[group].name.toUpperCase();
    group_box.appendChild(div);
    load_group_icons(json_groups[group]);
  }
  document.getElementById("groups").childNodes.forEach((element) => {
    element.addEventListener("mouseenter", highlightObjective);
    element.addEventListener("mouseout", removeHighlight);
    element.addEventListener("click", zoomObjective);
  });
}

function load_map(map_file) {
  let map_heightMap = new THREE.Texture();
  map_heightMap = loader.load(map_file);
  const map_geometry = new THREE.PlaneGeometry(
    size,
    size,
    resolution,
    resolution
  );

  const map_material = new THREE.ShaderMaterial({
    uniforms: {
      // Feed the heightmap
      bumpTexture: { value: map_heightMap },
      // Feed the scaling constant for the heightmap
      bumpScale: { value: 100 },
      selection: { value: false },
      highlight_zone: { value: new THREE.Vector2(0.0, 0.0) },
      zone: { value: new THREE.Vector2(0.0, 0.0) },
      current_range: { value: size },
      zoom: { value: min_zoom },
    },
    vertexShader: `
      uniform sampler2D bumpTexture;
      uniform float bumpScale;
      uniform float zoom;
  
      varying float vAmount;
      varying vec2 vUV;
      varying vec4 pos;
      
      void main()
      {
          // The "coordinates" in UV mapping representation
          vUV = uv;
      
          // The heightmap data at those coordinates
          vec4 bumpData = texture2D(bumpTexture, uv);
      
          // height map is grayscale, so it doesn't matter if you use r, g, or b.
          vAmount = bumpData.r;
      
          // move the position along the normal
          vec3 newPosition = position + normal * bumpScale * vAmount;
      
          // Compute the position of the vertex using a standard formula
  
          pos = vec4(newPosition, 1.0);
  
          gl_PointSize = zoom;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
      `,
    fragmentShader: `
      uniform float current_range;
      uniform bool selection;
      uniform vec2 zone;
      uniform vec2 highlight_zone;
  
      varying vec2 vUV;
      varying float vAmount;
      varying vec4 pos;
      
      void main()
      {
          float length = 100.0;
          float border = 3.0;

          if (selection){
            if ((pos.x > (highlight_zone.x - length - border) && pos.x < (highlight_zone.x + length + border)) && (pos.y > (highlight_zone.y - length - border) && pos.y < (highlight_zone.y + length + border))){
              if ((pos.x > (highlight_zone.x - length + border) && pos.x < (highlight_zone.x + length - border)) && (pos.y > (highlight_zone.y - length + border) && pos.y < (highlight_zone.y + length - border))) {
                gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
              }
              else {
                gl_FragColor = vec4(0.8,0.8,1.0, 1.0);
              }
            }
            else{
              if ((pos.x > (zone.x - current_range) && pos.x < (zone.x + current_range)) && (pos.y > (zone.y - current_range) && pos.y < (zone.y + current_range))) {
                gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
              }
              else {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
              }
            }
          }
          else {
              if ((pos.x > (zone.x - current_range) && pos.x < (zone.x + current_range)) && (pos.y > (zone.y - current_range) && pos.y < (zone.y + current_range))) {
                gl_FragColor = vec4(vAmount-0.2, vAmount+0.2, vAmount+0.4, 1.0);
              }
              else {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
              }
          }
      }
      `,
    wireframe: false,
  });
  map_mesh = new THREE.Points(map_geometry, map_material);
  scene.add(map_mesh);
}

function create_line() {
  // camera coords to world coords
  const points = [];
  points.push(new THREE.Vector3(0.0, 0.0, 0.0));
  points.push(new THREE.Vector3(0.0, 0.0, 0.0));
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0xffffff });
  line = new THREE.Line(geometry, material);
  scene.add(line);
}

// Events
function hide_about(event) {
  about.style.visibility = "hidden";
  about_button.style.visibility = "visible";
}

function show_about(event) {
  about.style.visibility = "visible";
  about_button.style.visibility = "hidden";
}

function highlightObjective(event) {
  if (reset_view.style.visibility != "visible") {
    group_coordinates = mission_info.groups[event.target.id].coordinates;
    map_mesh.material.uniforms.selection = {
      value: true,
    };
    const obj_coord = new THREE.Vector3(
      group_coordinates[0],
      group_coordinates[1],
      group_coordinates[2]
    );
    map_mesh.material.uniforms.highlight_zone = {
      value: obj_coord,
    };
    const rect = event.target.getBoundingClientRect();
    screenX = rect.right;
    screenY = rect.y + rect.height / 2;
    highlighted = true;
  }
}

function removeHighlight() {
  map_mesh.material.uniforms.selection = {
    value: false,
  };
  highlighted = false;
}

function zoomObjective(event) {
  // get group info
  group_info_box.textContent = "";
  let div_name = document.createElement("div");
  div_name.className = "info_name";
  div_name.textContent =
    mission_info.groups[event.target.id].name.toUpperCase();
  group_info_box.appendChild(div_name);

  let coord_div = document.createElement("div");
  coord_div.className = "info_item_coords";
  coord_div.innerText =
    "[ " + mission_info.groups[event.target.id].coordinates + " ]";
  group_info_box.appendChild(coord_div);

  let group_items = mission_info.groups[event.target.id].items;
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
    group_info_box.appendChild(div_item_name);

    let div_desc = document.createElement("div");
    div_desc.className = "info_item_desc";
    div_desc.innerHTML = group_items[item].description;
    group_info_box.appendChild(div_desc);
  }

  // get coords
  group_coordinates = mission_info.groups[event.target.id].coordinates;
  camera_target.x = group_coordinates[0];
  camera_target.y = group_coordinates[1];
  camera_target.z = group_coordinates[2] + max_zoom;
  if (zoomingOut || zoomingIn) {
    Object.assign(zoom_start_pos, ...lerp_position);
    lerp_clock.stop();
  } else {
    Object.assign(zoom_start_pos, ...camera_target);
  }
  map_mesh.material.uniforms.selection = {
    value: false,
  };
  highlighted = false;
  zoomingIn = true;
  lerp_clock.start();
  group_info_box.style.visibility = "visible";
  reset_view.style.visibility = "visible";
  about.style.visibility = "hidden";
  about_button.style.visibility = "hidden";
}

function resetZoom() {
  camera_target.x = 0.0;
  camera_target.y = 0.0;
  camera_target.z = min_zoom;
  if (zoomingOut || zoomingIn) {
    Object.assign(zoom_start_pos, ...lerp_position);
    lerp_clock.stop();
  } else {
    Object.assign(zoom_start_pos, ...camera_target);
  }

  zoomingOut = true;
  lerp_clock.start();
  reset_view.style.visibility = "hidden";
  group_info_box.style.visibility = "hidden";
  if (about_button.style.visibility == "hidden"){
    about_button.style.visibility = "visible";
  }
}

// Updates
function update_camera() {
  const time = camera_clock.getElapsedTime();
  const new_orbit_pos = new THREE.Vector2(
    Math.sin(time * rotation_speed),
    Math.cos(time * rotation_speed)
  );
  const angle = old_orbit_pos.angleTo(new_orbit_pos);
  old_orbit_pos = new_orbit_pos;

  if (zoomingIn || zoomingOut) {
    let lerp_elapsed_time = lerp_clock.getElapsedTime();
    if (lerp_elapsed_time < lerp_time * 15) {
      lerp_move_perc = THREE.MathUtils.mapLinear(
        lerp_elapsed_time,
        0,
        lerp_time * 15,
        0.0,
        1.0
      );
      lerp_position = zoom_start_pos.lerp(camera_target, lerp_move_perc);
    } else {
      zoomingIn = false;
      zoomingOut = false;
      lerp_clock.stop();
    }
  } else {
    lerp_position = camera_target;
  }
  camera.position.x = new_orbit_pos.x * lerp_position.z + lerp_position.x;
  camera.position.y = new_orbit_pos.y * lerp_position.z + lerp_position.y;
  camera.position.z = lerp_position.z;
  camera.rotateOnWorldAxis(new THREE.Vector3(0.0, 0.0, 1.0), -angle);
  update_minimap(lerp_position.x, lerp_position.y, lerp_position.z);
}

function update_shaders() {
  map_mesh.material.uniforms.current_range = {
    value: lerp_position.z,
  };
  map_mesh.material.uniforms.zone = {
    value: new THREE.Vector2(lerp_position.x, lerp_position.y),
  };
  map_mesh.material.uniforms.zoom = {
    value: min_zoom / lerp_position.z,
  };
  for (const icon in map_icons) {
    map_icons[icon].mesh.material.uniforms.current_range = {
      value: lerp_position.z,
    };
    map_icons[icon].mesh.material.uniforms.zone = {
      value: new THREE.Vector2(lerp_position.x, lerp_position.y),
    };
    if (
      map_icons[icon].mesh.position.x > lerp_position.x - lerp_position.z &&
      map_icons[icon].mesh.position.x < lerp_position.x + lerp_position.z &&
      map_icons[icon].mesh.position.y > lerp_position.y - lerp_position.z &&
      map_icons[icon].mesh.position.y < lerp_position.y + lerp_position.z
    ) {
      map_icons[icon].mesh.material.uniforms.color = {
        value: new THREE.Vector3(
          map_icons[icon].color[0] / 255.0,
          map_icons[icon].color[1] / 255.0,
          map_icons[icon].color[2] / 255.0
        ),
      };
    } else {
      map_icons[icon].mesh.material.uniforms.color = {
        value: new THREE.Vector3(0.0, 0.0, 0.0),
      };
    }
  }
}

function update_minimap(x, y, zoom) {
  let map_x = THREE.MathUtils.mapLinear(x, -size / 2, size / 2, 0, 100);
  let map_y = THREE.MathUtils.mapLinear(y, -size / 2, size / 2, 100, 0);
  let box_size = THREE.MathUtils.mapLinear(zoom, 0, min_zoom, 0, 100);
  map_x_axis.style.left = map_x + "%";
  map_y_axis.style.top = map_y + "%";
  map_zoom_zone.style.width = box_size + "%";
  map_zoom_zone.style.height = box_size + "%";
  map_zoom_zone.style.left = map_x - box_size / 2 + "%";
  map_zoom_zone.style.top = map_y - box_size / 2 + "%";
}

function update_objective_line(screenX, screenY, WorldX, WorldY, WorldZ) {
  // Convert screen coordinates to NDC
  if (highlighted) {
    const ndcX = (screenX / window.innerWidth) * 2 - 1;
    const ndcY = -(screenY / window.innerHeight) * 2 + 1;
    const ndcZ = 1.0; // Depth value for the near plane

    // Create a vector representing NDC coordinates
    const ndcVector = new THREE.Vector3(ndcX, ndcY, ndcZ);

    // Use the camera's projection matrix inverse to transform NDC to camera space
    const cameraSpaceVector = ndcVector
      .clone()
      .applyMatrix4(camera.projectionMatrixInverse);

    // Transform the camera space coordinates to world space using the camera's matrixWorld
    const worldSpaceVector = cameraSpaceVector
      .clone()
      .applyMatrix4(camera.matrixWorld);

    const newPositions = new Float32Array([
      worldSpaceVector.x,
      worldSpaceVector.y,
      worldSpaceVector.z, // Vertex 1
      WorldX,
      WorldY,
      WorldZ, // Vertex 2
    ]);

    // Update the position attribute with the new array
    line.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(newPositions, 3)
    );
    // Mark the geometry as needing an update
    line.geometry.attributes.position.needsUpdate = true;
  } else {
    line.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([
          0,
          0,
          0, // Vertex 1
          0,
          0,
          0, // Vertex 2
        ]),
        3
      )
    );
  }
}

function animate() {
  requestAnimationFrame(animate);
  update_camera();
  update_objective_line(
    screenX,
    screenY,
    group_coordinates[0],
    group_coordinates[1],
    group_coordinates[2]
  );
  update_shaders();
  renderer.render(scene, camera);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
