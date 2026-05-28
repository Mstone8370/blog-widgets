/*
 * PBR 시각화 위젯 공용 코어.
 * Z-up(Unreal) 구체 + 바닥 격자 + z축 + 조명 화살표 씬을 구성하고,
 * orbit 드래그 / 자동회전 / 관성 / 적응형 FOV / resize 를 모두 처리한다.
 * 위젯별로 다른 것은 fragmentShader 와 uniforms, 그리고 컨트롤 DOM 뿐이다.
 *
 * 좌표계: Unreal (좌수, X forward, Y right, Z up). 구체 up/극축 = +Z.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const PI = Math.PI;

const ACCENT_L = 0xe0a020;   // light arrow
const AXIS_C   = 0x8a93a6;   // z axis
const GRID_C   = 0xe3e3e6;
const GRID_MID = 0xd0d0d4;

const BASE_FOV = 40 * PI / 180;   // 짧은 쪽 축에 고정할 FOV
const CAM_DIST = 4.2;
const ORBIT_EL = 0.35;            // elevation (pitch 고정)

const idleDelay = 3.0;            // 입력 없을 때 자동회전 재시작까지 (초)
const rotSpeed  = 0.25;           // 자동회전 목표 속도 (rad/s)
const RAMP_TIME = 1.5;            // 목표 속도까지 가속 시간 (초)
const DAMP      = 10;             // 관성 감쇠 (클수록 빨리 멈춤)
const VEL_MIN   = 0.15;           // 이 속도 이하로 떨어지면 관성 종료 → idle 타이머 시작

const VERTEX_SHADER = `
  varying vec3 vN;
  varying vec3 vWP;
  void main() {
    vN = normalize(mat3(modelMatrix) * normal);
    vWP = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ARROW_UP = new THREE.Vector3(0, 1, 0);   // 화살표 로컬 기본 방향
function makeArrow(colorHex, len, headLen, shaftR, headR, seg) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: colorHex });
  const shaftLen = len - headLen;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(shaftR, shaftR, shaftLen, seg), mat);
  shaft.position.y = shaftLen * 0.5;
  const head = new THREE.Mesh(new THREE.ConeGeometry(headR, headLen, seg), mat);
  head.position.y = shaftLen + headLen * 0.5;
  g.add(shaft, head);
  return g;
}

// vec3 uniform(색상/벡터) 생성 헬퍼. 위젯 HTML 은 THREE 를 직접 import 하지 않으므로 제공.
export function vec3(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

/*
 * @param {object} opts
 *   canvas         : <canvas> 엘리먼트 (필수)
 *   fragmentShader : 프래그먼트 셰이더 소스 (필수). uLightDir/uCamPos 는 자동 주입.
 *   uniforms       : 위젯별 추가 uniform (예: { uRough: { value: 0.5 } })
 *   orbitAz        : 초기 azimuth (기본 0.6)
 *   lightTheta     : 초기 조명 천정각 (rad, 기본 40°)
 *   clearColor     : 배경색 (기본 0x404040)
 * @returns { sphereMat, requestDraw, render, setLightTheta }
 */
export function initPBRWidget(opts) {
  const {
    canvas,
    fragmentShader,
    uniforms = {},
    orbitAz: initAz = 0.6,
    lightTheta: initTheta = 40 * PI / 180,
    clearColor = 0x404040,
  } = opts;

  let orbitAz = initAz;
  let lightTheta = initTheta;

  // ---- renderer / scene / camera ----
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor(clearColor, 1);
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.up.set(0, 0, 1);   // Z-up

  // ---- 구체 (위젯별 셰이더) ----
  const sphereMat = new THREE.ShaderMaterial({
    uniforms: Object.assign({
      uLightDir: { value: new THREE.Vector3() },
      uCamPos:   { value: new THREE.Vector3() },
    }, uniforms),
    vertexShader: VERTEX_SHADER,
    fragmentShader,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), sphereMat));

  // ---- 바닥 격자 (x-y 평면, z=0), 간격 0.5 ----
  const grid = new THREE.GridHelper(4, 8, GRID_MID, GRID_C);
  grid.rotation.x = PI / 2;
  scene.add(grid);

  // ---- z축 (선) ----
  scene.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1.5),
    ]),
    new THREE.LineBasicMaterial({ color: AXIS_C })
  ));

  // ---- 조명 방향 화살표 ----
  const lightArrow = makeArrow(ACCENT_L, 1.5, 0.16, 0.007, 0.035, 32);
  scene.add(lightArrow);

  // ---- 카메라 / 조명 갱신 ----
  function updateCamera() {
    const ce = Math.cos(ORBIT_EL), se = Math.sin(ORBIT_EL);
    camera.position.set(
      CAM_DIST * ce * Math.cos(orbitAz),
      CAM_DIST * ce * Math.sin(orbitAz),
      CAM_DIST * se
    );
    camera.lookAt(0, 0, 0);
    sphereMat.uniforms.uCamPos.value.copy(camera.position);
  }

  function setLightTheta(rad) {
    lightTheta = rad;
    const dir = new THREE.Vector3(Math.sin(lightTheta), 0, Math.cos(lightTheta)).normalize();
    sphereMat.uniforms.uLightDir.value.copy(dir);
    lightArrow.quaternion.setFromUnitVectors(ARROW_UP, dir);
    requestDraw();
  }

  // ---- 렌더 (on-demand, rAF 코얼레싱) ----
  let rafPending = false;
  function requestDraw() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; render(); });
  }
  function render() {
    updateCamera();
    renderer.render(scene, camera);
  }

  // ---- 상시 rAF 루프: 입력이 idleDelay 동안 없으면 azimuth 천천히 회전 ----
  let lastInput = -Infinity;   // 시작 시 바로 회전
  let velocity = 0;            // 드래그 관성 각속도
  let ramp = 0;                // 회전 가속 램프 (0~1)
  let prevT = performance.now();
  function tick(now) {
    const dt = Math.min((now - prevT) / 1000, 0.1);
    prevT = now;
    if (dragging) {
      lastInput = now;
      ramp = 0;
    } else if (Math.abs(velocity) > VEL_MIN) {
      // 드래그 관성: 감쇠하며 회전, 도는 동안 idle 타이머 정지
      orbitAz += velocity * dt;
      velocity *= Math.exp(-dt * DAMP);
      if (Math.abs(velocity) <= VEL_MIN) velocity = 0;   // 임계값 도달 → 정지
      ramp = 0;
      lastInput = now;   // 회전이 멈추는 이 시점부터 idle 타이머 시작
      render();
    } else if ((now - lastInput) / 1000 >= idleDelay) {
      ramp = Math.min(ramp + dt / RAMP_TIME, 1);
      const eased = ramp * ramp * (3 - 2 * ramp);   // smoothstep 가속
      orbitAz -= rotSpeed * eased * dt;
      render();
    } else {
      ramp = 0;   // 멈추면 다음 회전은 다시 천천히 시작
    }
    requestAnimationFrame(tick);
  }

  // ---- 적응형 FOV resize ----
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    const aspect = w / h;
    camera.aspect = aspect;
    // 짧은 쪽 축의 FOV 고정 (contain): 세로로 길면 수평 FOV 고정, 가로로 길면 수직 FOV 고정
    const vfov = aspect >= 1
      ? BASE_FOV
      : 2 * Math.atan(Math.tan(BASE_FOV / 2) / aspect);
    camera.fov = vfov * 180 / PI;
    camera.updateProjectionMatrix();
    render();
  }

  // ---- 드래그 (yaw 만 조절, pitch 고정) ----
  let dragging = false, prevX = 0, lastMoveT = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    velocity = 0;
    prevX = e.clientX;
    lastMoveT = performance.now();
    lastInput = lastMoveT;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const mt = performance.now();
    const dtMove = Math.max((mt - lastMoveT) / 1000, 1e-3);
    const dAz = -(e.clientX - prevX) * 0.008;
    orbitAz += dAz;
    velocity = dAz / dtMove;   // 각속도 (관성용)
    prevX = e.clientX;
    lastMoveT = mt;
    lastInput = mt;
    requestDraw();
  });
  const endDrag = () => {
    if (dragging && performance.now() - lastMoveT > 100) velocity = 0;   // 멈춘 채 놓으면 관성 없음
    dragging = false;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointerleave', endDrag);

  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

  // ---- init ----
  setLightTheta(lightTheta);
  resize();
  requestAnimationFrame(tick);

  return { sphereMat, requestDraw, render, setLightTheta };
}
