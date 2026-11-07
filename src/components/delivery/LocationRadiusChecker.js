'use client';

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Navigation, CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useSite } from '@/context/SiteContext';

const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false, loading: () => <div className="h-64 rounded-xl bg-zinc-100 animate-pulse" /> });

/**
 * Lets the customer pick a delivery point (GPS or map tap) and asks the SERVER whether it is inside
 * the delivery radius. The result here is for display; checkout re-validates on the server.
 */
export default function LocationRadiusChecker({ onEligibilityChange }) {
  const { customerLocation, setCustomerLocation, setOrderType } = useCart();
  const { settings } = useSite();
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState(null);
  const [address, setAddress] = useState(customerLocation?.address || '');

  useEffect(() => {
    if (customerLocation && onEligibilityChange) onEligibilityChange(customerLocation.isEligible, customerLocation);
  }, [customerLocation, onEligibilityChange]);

  const verify = useCallback(
    async (lat, lng, source) => {
      setLoading(true);
      setErrorState(null);
      try {
        const res = await fetch('/api/delivery/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ latitude: lat, longitude: lng }) });
        const r = await res.json();
        if (!res.ok) throw new Error(r.error);
        setCustomerLocation({ lat, lng, distanceM: r.distanceM, isEligible: r.eligible, reason: r.message, source, address: customerLocation?.address || address });
      } catch {
        setErrorState('check_failed');
      } finally {
        setLoading(false);
      }
    },
    [address, customerLocation?.address, setCustomerLocation]
  );

  const useGps = () => {
    if (!navigator.geolocation) return setErrorState('unavailable');
    setLoading(true);
    setErrorState(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoading(false);
        if (pos.coords.accuracy > 500) setErrorState('inaccurate');
        verify(pos.coords.latitude, pos.coords.longitude, 'gps');
      },
      (err) => {
        setLoading(false);
        setErrorState(err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.TIMEOUT ? 'timeout' : 'unavailable');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  };

  const onAddress = (v) => {
    setAddress(v);
    if (customerLocation) setCustomerLocation({ ...customerLocation, address: v });
  };

  if (!settings) return null;
  const shop = settings.shop;
  const radiusM = settings.delivery.radius_m;
  const warn = 'p-3 rounded-lg text-xs flex items-start gap-2 border bg-amber-50 border-amber-200 text-amber-800';
  const msgs = {
    denied: 'Location permission was denied. You can tap your location on the map instead, or choose pickup.',
    timeout: 'Location timed out. Try again, or tap your location on the map.',
    unavailable: 'We couldn’t get your GPS location. Tap your location on the map, or choose pickup.',
    inaccurate: 'Your GPS signal is weak, so the pin may be off. Please check it on the map.',
    check_failed: 'We couldn’t check your location. Please try again.',
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-red-100 text-red-700 flex items-center justify-center">
          <MapPin size={18} />
        </div>
        <div>
          <h3 className="font-bold text-sm text-zinc-900">Delivery location</h3>
          <p className="text-xs text-zinc-500">
            Delivery is available within <strong>{radiusM} m</strong> of our shop. We only use your location to check this.
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={useGps}
        disabled={loading}
        className="flex items-center justify-center gap-1.5 px-4 py-2 bg-red-700 hover:bg-red-600 disabled:bg-zinc-400 text-white text-xs font-semibold rounded-lg"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Navigation size={14} />}
        {loading ? 'Checking…' : 'Use my current location'}
      </button>

      <MapPicker shop={shop} radiusM={radiusM} value={customerLocation && { lat: customerLocation.lat, lng: customerLocation.lng }} onPick={(lat, lng) => verify(lat, lng, 'map')} />
      <p className="text-[11px] text-zinc-500 -mt-2">Or tap the map to drop a pin on your house/street. The orange dot is our shop.</p>

      {errorState && (
        <div className={warn} role="alert">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <span>{msgs[errorState]}</span>
        </div>
      )}

      {customerLocation && (
        <div
          role="status"
          className={`p-3 rounded-lg text-xs flex items-start gap-2 border ${customerLocation.isEligible ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}
        >
          {customerLocation.isEligible ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" /> : <XCircle size={16} className="text-red-600 shrink-0 mt-0.5" />}
          <div className="space-y-0.5 flex-1">
            <div className="font-bold">{customerLocation.isEligible ? 'Delivery available' : 'Outside our delivery area'}</div>
            <p className="text-[11px] leading-relaxed">{customerLocation.reason}</p>
            {!customerLocation.isEligible && (
              <button type="button" onClick={() => setOrderType('pickup')} className="mt-1.5 font-bold underline text-red-700">
                Order for pickup instead
              </button>
            )}
          </div>
        </div>
      )}

      <div>
        <label htmlFor="addr" className="block text-xs font-semibold text-zinc-700 mb-1">
          House / street address
        </label>
        <textarea
          id="addr"
          rows={2}
          value={address}
          onChange={(e) => onAddress(e.target.value)}
          placeholder="e.g. House 12, N Block, Model Town Extension"
          className="w-full text-xs p-3 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-600/30 focus:border-red-600"
        />
      </div>
    </div>
  );
}
