'use client';

import React, { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

// Interactive map (OpenStreetMap tiles, no API key). Shows the shop, the delivery radius and a draggable pin.
export default function MapPicker({ shop, radiusM, value, onPick }) {
  const el = useRef(null);
  const state = useRef({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !el.current || state.current.map) return;
      const map = L.map(el.current, { scrollWheelZoom: false }).setView([shop.lat, shop.lng], 15);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
      L.circle([shop.lat, shop.lng], { radius: radiusM, color: '#b91c1c', fillColor: '#b91c1c', fillOpacity: 0.08, weight: 2 }).addTo(map);
      L.circleMarker([shop.lat, shop.lng], { radius: 9, color: '#18181b', fillColor: '#f59e0b', fillOpacity: 1, weight: 3 }).bindTooltip('Haq Bahu Tandoor').addTo(map);
      map.on('click', (e) => onPick(e.latlng.lat, e.latlng.lng));
      state.current = { map, L };
      if (value) place(value.lat, value.lng);
    })();
    function place(lat, lng) {
      const { map, L } = state.current;
      if (!map) return;
      if (state.current.pin) state.current.pin.setLatLng([lat, lng]);
      else {
        state.current.pin = L.circleMarker([lat, lng], { radius: 8, color: '#fff', fillColor: '#2563eb', fillOpacity: 1, weight: 3 }).addTo(map);
      }
    }
    state.current.place = place;
    return () => {
      cancelled = true;
      state.current.map?.remove();
      state.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop.lat, shop.lng, radiusM]);

  useEffect(() => {
    if (value && state.current.place) {
      state.current.place(value.lat, value.lng);
      state.current.map?.panTo([value.lat, value.lng]);
    }
  }, [value]);

  return <div ref={el} className="h-64 w-full rounded-xl border border-zinc-200 z-0" role="application" aria-label="Map: tap to set your delivery location" />;
}
