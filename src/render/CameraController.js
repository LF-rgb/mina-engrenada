// Câmera isométrica: alvo no chão, distância (zoom), rotação em passos de 90° (Q/E) e inclinação fixa.
import * as THREE from 'three';

export class CameraController {
  constructor(camera, map, settings, terrain) {
    this.camera = camera;
    this.map = map;
    this.settings = settings;
    this.terrainRef = terrain;
    this.target = new THREE.Vector3(43, 0, 36);
    this.goal = this.target.clone();
    this.distance = 26; this.goalDistance = 26;
    this.minD = 9; this.maxD = 70;
    this.yaw = Math.PI / 4; this.goalYaw = this.yaw;
    this.pitch = THREE.MathUtils.degToRad(52);
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, inside: false };
    this.dragging = false;
    this.lastDrag = null;
  }

  // vetores de movimento no plano, alinhados à câmera
  axes() {
    const f = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); // para frente na tela
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    return { f, r };
  }

  pan(dx, dz) { this.goal.x += dx; this.goal.z += dz; this.clamp(); }

  zoom(delta) {
    const inv = this.settings.invertZoom ? -1 : 1;
    this.goalDistance *= Math.pow(1.0015, delta * inv * this.settings.zoomSpeed);
    this.goalDistance = THREE.MathUtils.clamp(this.goalDistance, this.minD, this.maxD);
  }

  rotate(steps) { this.goalYaw += steps * Math.PI / 2; }

  focus(x, z, dist) { this.goal.set(x, 0, z); if (dist) this.goalDistance = dist; this.clamp(); }

  dragStart(x, y) { this.dragging = true; this.lastDrag = { x, y }; }
  dragMove(x, y) {
    if (!this.dragging) return;
    const dx = x - this.lastDrag.x, dy = y - this.lastDrag.y;
    this.lastDrag = { x, y };
    const k = (this.distance / 900) * this.settings.dragSensitivity * 2.2;
    const { f, r } = this.axes();
    this.goal.addScaledVector(r, -dx * k);
    this.goal.addScaledVector(f, dy * k);
    this.target.copy(this.goal); // arraste responde de imediato
    this.clamp();
  }
  dragEnd() { this.dragging = false; }

  clamp() {
    const m = 6;
    this.goal.x = THREE.MathUtils.clamp(this.goal.x, m, this.map.w - m);
    this.goal.z = THREE.MathUtils.clamp(this.goal.z, m, this.map.h - m);
  }

  update(dt, viewW, viewH) {
    const sp = 18 * this.settings.cameraSpeed * (this.distance / 26) * dt;
    const { f, r } = this.axes();
    const k = this.keys;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) mz += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (this.settings.edgeScroll && this.mouse.inside && !this.dragging) {
      const e = 12;
      if (this.mouse.x < e) mx -= 1; if (this.mouse.x > viewW - e) mx += 1;
      if (this.mouse.y < e) mz += 1; if (this.mouse.y > viewH - e) mz -= 1;
    }
    if (mx || mz) {
      this.goal.addScaledVector(r, mx * sp);
      this.goal.addScaledVector(f, mz * sp);
      this.clamp();
    }
    const s = 1 - Math.exp(-dt * 12);
    this.target.lerp(this.goal, s);
    this.distance += (this.goalDistance - this.distance) * s;
    this.yaw += (this.goalYaw - this.yaw) * (1 - Math.exp(-dt * 9));

    // posição da câmera; evita atravessar o relevo erguendo-a se necessário
    const horiz = Math.cos(this.pitch) * this.distance;
    let y = Math.sin(this.pitch) * this.distance;
    const cx = this.target.x + Math.sin(this.yaw) * horiz;
    const cz = this.target.z + Math.cos(this.yaw) * horiz;
    if (this.terrainRef?.()) {
      const ground = this.terrainRef().heightAt(Math.max(0, Math.min(this.map.w - 0.01, cx)), Math.max(0, Math.min(this.map.h - 0.01, cz)));
      y = Math.max(y, ground + 3);
    }
    this.camera.position.set(cx, y, cz);
    this.camera.lookAt(this.target);
  }
}
