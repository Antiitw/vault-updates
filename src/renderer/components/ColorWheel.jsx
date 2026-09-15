import React, { useRef, useEffect, useCallback, useState } from 'react';

function ColorWheel({ color, onChange }) {
  const wheelRef = useRef(null);
  const squareRef = useRef(null);
  const [isDraggingWheel, setIsDraggingWheel] = useState(false);
  const [isDraggingSquare, setIsDraggingSquare] = useState(false);
  const [hsl, setHsl] = useState({ h: 270, s: 70, l: 65 });

  const hexToHsl = (hex) => {
    if (!hex || !hex.startsWith('#')) return { h: 270, s: 70, l: 65 };
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  };

  const hslToHex = (h, s, l) => {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  };

  useEffect(() => {
    setHsl(hexToHsl(color));
  }, [color]);

  const getColorFromWheel = useCallback((clientX, clientY) => {
    const rect = wheelRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (angle < 0) angle += 360;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const radius = rect.width / 2;
    if (dist > radius) return null;
    const saturation = Math.min(100, (dist / radius) * 120);
    return { h: Math.round(angle), s: Math.round(saturation), l: hsl.l };
  }, [hsl.l]);

  const getColorFromSquare = useCallback((clientX, clientY) => {
    const rect = squareRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const s = Math.round(x * 100);
    const l = Math.round((1 - y) * 100);
    return { h: hsl.h, s, l };
  }, [hsl.h]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isDraggingWheel) {
        const newColor = getColorFromWheel(e.clientX, e.clientY);
        if (newColor) {
          setHsl(newColor);
          onChange(hslToHex(newColor.h, newColor.s, newColor.l));
        }
      }
      if (isDraggingSquare) {
        const newColor = getColorFromSquare(e.clientX, e.clientY);
        if (newColor) {
          setHsl(newColor);
          onChange(hslToHex(newColor.h, newColor.s, newColor.l));
        }
      }
    };
    const handleMouseUp = () => {
      setIsDraggingWheel(false);
      setIsDraggingSquare(false);
    };
    if (isDraggingWheel || isDraggingSquare) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingWheel, isDraggingSquare, getColorFromWheel, getColorFromSquare, onChange]);

  const handleWheelMouseDown = (e) => {
    e.preventDefault();
    setIsDraggingWheel(true);
    const newColor = getColorFromWheel(e.clientX, e.clientY);
    if (newColor) {
      setHsl(newColor);
      onChange(hslToHex(newColor.h, newColor.s, newColor.l));
    }
  };

  const handleSquareMouseDown = (e) => {
    e.preventDefault();
    setIsDraggingSquare(true);
    const newColor = getColorFromSquare(e.clientX, e.clientY);
    if (newColor) {
      setHsl(newColor);
      onChange(hslToHex(newColor.h, newColor.s, newColor.l));
    }
  };

  const wheelRadius = 110;
  const thumbAngle = (hsl.h - 90) * (Math.PI / 180);
  const thumbDist = (hsl.s / 120) * wheelRadius;
  const thumbX = Math.cos(thumbAngle) * thumbDist;
  const thumbY = Math.sin(thumbAngle) * thumbDist;

  const squareSize = wheelRadius * 0.72;

  return (
    <div className="color-wheel-container">
      <div className="color-wheel-wrapper">
        <div
          className="color-wheel-ring"
          ref={wheelRef}
          onMouseDown={handleWheelMouseDown}
          style={{ width: wheelRadius * 2, height: wheelRadius * 2 }}
        >
          <div className="color-wheel-canvas" />
          <div
            className="color-wheel-thumb"
            style={{
              transform: `translate(${thumbX - 10}px, ${thumbY - 10}px)`,
              background: hslToHex(hsl.h, hsl.s, hsl.l),
              boxShadow: `0 0 0 3px white, 0 0 0 5px rgba(0,0,0,0.3), 0 0 12px ${hslToHex(hsl.h, hsl.s, hsl.l)}80`
            }}
          />
        </div>
        <div
          className="color-square"
          ref={squareRef}
          onMouseDown={handleSquareMouseDown}
          style={{
            width: squareSize,
            height: squareSize,
          }}
        >
          <div className="color-square-saturation" />
          <div className="color-square-brightness" />
          <div
            className="color-square-thumb"
            style={{
              left: `${hsl.s}%`,
              top: `${100 - hsl.l}%`,
              background: hslToHex(hsl.h, hsl.s, hsl.l),
              boxShadow: `0 0 0 2px white, 0 0 0 3px rgba(0,0,0,0.3)`
            }}
          />
        </div>
      </div>
      <div className="color-wheel-preview-row">
        <div className="color-preview-swatch" style={{ background: hslToHex(hsl.h, hsl.s, hsl.l) }} />
        <input
          className="color-hex-input"
          type="text"
          value={hslToHex(hsl.h, hsl.s, hsl.l)}
          onChange={(e) => {
            const val = e.target.value;
            if (/^#[0-9a-f]{6}$/i.test(val)) {
              setHsl(hexToHsl(val));
              onChange(val);
            }
          }}
        />
      </div>
    </div>
  );
}

export default ColorWheel;
