/**
 * Globe panel — a Cesium Ion-style 3D globe for the flight path, built on
 * three.js (already a dependency) with a bundled offline earth texture.
 * Fully local: no tokens, no network, no paid services.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useResolvedTheme } from '../../hooks/useTheme';
import { useLogStore } from '../../stores/log-store';
import { getFlightPath } from './log-utils';
import earthDarkUrl from '../../assets/globe/earth-dark.png';
import earthLightUrl from '../../assets/globe/earth-light.png';

const DEG2RAD = Math.PI / 180;
/** Max altitude offset above the unit sphere (fraction of radius). */
const ALT_OFFSET = 0.035;

interface PathPoint {
  lat: number;
  lng: number;
  alt: number;
  vec: THREE.Vector3;
}

/** Equirectangular projection of lat/lng onto the unit sphere (y-up). */
function latLngToVec(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lng + 180) * DEG2RAD;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function altitudeColor(t: number): THREE.Color {
  // Blue (low) -> cyan -> green -> yellow -> red (high)
  const c = new THREE.Color();
  if (t < 0.25) c.lerpColors(new THREE.Color('#3b82f6'), new THREE.Color('#06b6d4'), t * 4);
  else if (t < 0.5) c.lerpColors(new THREE.Color('#06b6d4'), new THREE.Color('#10b981'), (t - 0.25) * 4);
  else if (t < 0.75) c.lerpColors(new THREE.Color('#10b981'), new THREE.Color('#f59e0b'), (t - 0.5) * 4);
  else c.lerpColors(new THREE.Color('#f59e0b'), new THREE.Color('#ef4444'), (t - 0.75) * 4);
  return c;
}

export function GlobePanel() {
  const currentLog = useLogStore((s) => s.currentLog);
  const resolvedTheme = useResolvedTheme();
  const isLight = resolvedTheme === 'light';
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const autoRotateRef = useRef(true);

  const flightPath = useMemo(() => getFlightPath(currentLog), [currentLog]);

  const pathData = useMemo<{ points: PathPoint[] } | null>(() => {
    if (flightPath.length < 2) return null;
    const alts = flightPath.map((p) => p[2]);
    const minAlt = Math.min(...alts);
    const maxAlt = Math.max(...alts);
    const range = maxAlt - minAlt || 1;
    const points = flightPath.map(([lat, lng, alt]) => ({
      lat,
      lng,
      alt,
      vec: latLngToVec(lat, lng, 1 + ALT_OFFSET * ((alt - minAlt) / range)),
    }));
    return { points };
  }, [flightPath]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !pathData) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
    camera.position.set(0, 0, 3.6);

    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.4;
    controls.maxDistance = 8;
    controls.autoRotate = autoRotateRef.current;
    controls.autoRotateSpeed = 0.6;

    // Earth
    const texture = new THREE.TextureLoader().load(isLight ? earthLightUrl : earthDarkUrl);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const earthMat = new THREE.MeshBasicMaterial({ map: texture });
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), earthMat);
    scene.add(earth);

    // Atmosphere rim
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.015, 48, 48),
      new THREE.MeshBasicMaterial({ color: isLight ? '#3b82f6' : '#2563eb', transparent: true, opacity: 0.12, side: THREE.BackSide }),
    );
    scene.add(atmo);

    // Stars
    const starCount = 900;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(5 + Math.random() * 6);
      starPositions[i * 3] = v.x;
      starPositions[i * 3 + 1] = v.y;
      starPositions[i * 3 + 2] = v.z;
    }
    const starsGeo = new THREE.BufferGeometry();
    starsGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starsGeo,
      new THREE.PointsMaterial({ color: isLight ? '#334155' : '#cbd5e1', size: 0.02, sizeAttenuation: true, transparent: true, opacity: 0.8 }),
    );
    scene.add(stars);

    // Flight path line with altitude gradient
    const minAlt = Math.min(...pathData.points.map((p) => p.alt));
    const maxAlt = Math.max(...pathData.points.map((p) => p.alt));
    const range = maxAlt - minAlt || 1;
    const positions = new Float32Array(pathData.points.length * 3);
    const colors = new Float32Array(pathData.points.length * 3);
    pathData.points.forEach((p, i) => {
      positions[i * 3] = p.vec.x;
      positions[i * 3 + 1] = p.vec.y;
      positions[i * 3 + 2] = p.vec.z;
      const c = altitudeColor((p.alt - minAlt) / range);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    });
    const pathGeo = new THREE.BufferGeometry();
    pathGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pathGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const pathLine = new THREE.Line(
      pathGeo,
      new THREE.LineBasicMaterial({ vertexColors: true }),
    );
    scene.add(pathLine);

    // Start / end markers
    const mkStart = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 16, 16),
      new THREE.MeshBasicMaterial({ color: '#22c55e' }),
    );
    mkStart.position.copy(pathData.points[0]!.vec);
    const mkEnd = new THREE.Mesh(
      new THREE.SphereGeometry(0.022, 16, 16),
      new THREE.MeshBasicMaterial({ color: '#ef4444' }),
    );
    mkEnd.position.copy(pathData.points[pathData.points.length - 1]!.vec);
    scene.add(mkStart, mkEnd);

    // Frame the flight path
    const centroid = new THREE.Vector3();
    for (const p of pathData.points) centroid.add(p.vec);
    centroid.divideScalar(pathData.points.length);
    controls.target.copy(centroid);
    const dir = centroid.clone().normalize();
    camera.position.copy(centroid.clone().add(dir.multiplyScalar(3.2)));
    camera.lookAt(centroid);

    // Resize handling
    const resize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    // Render loop
    let raf = 0;
    let disposed = false;
    const tick = () => {
      if (disposed) return;
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      controlsRef.current = null;
      earth.geometry.dispose();
      earthMat.dispose();
      texture.dispose();
      atmo.geometry.dispose();
      (atmo.material as THREE.Material).dispose();
      starsGeo.dispose();
      (stars.material as THREE.Material).dispose();
      pathGeo.dispose();
      (pathLine.material as THREE.Material).dispose();
      mkStart.geometry.dispose();
      (mkStart.material as THREE.Material).dispose();
      mkEnd.geometry.dispose();
      (mkEnd.material as THREE.Material).dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, [pathData, isLight]);

  if (!pathData) {
    return (
      <div className="h-full flex items-center justify-center text-content-tertiary text-xs">
        No GPS data available
      </div>
    );
  }

  return (
    <div className="h-full relative">
      <div ref={containerRef} className="h-full w-full" />
      {/* Controls overlay */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
        <button
          onClick={() => {
            const next = !autoRotate;
            setAutoRotate(next);
            autoRotateRef.current = next;
            if (controlsRef.current) controlsRef.current.autoRotate = next;
          }}
          className={`text-[10px] px-2 py-1 rounded border transition-colors backdrop-blur-sm ${
            autoRotate
              ? 'bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border-blue-500/40'
              : 'bg-surface-overlay hover:bg-surface-raised text-content-secondary hover:text-content border-subtle'
          }`}
          title={autoRotate ? 'Auto-rotate is on' : 'Auto-rotate is off'}
        >
          {autoRotate ? 'Rotating' : 'Paused'}
        </button>
      </div>
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 text-[10px] text-content-secondary bg-surface-overlay/80 backdrop-blur-sm rounded px-2 py-1">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />Takeoff</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#ef4444' }} />Landing</span>
        <span className="text-content-tertiary">color = altitude</span>
      </div>
    </div>
  );
}
