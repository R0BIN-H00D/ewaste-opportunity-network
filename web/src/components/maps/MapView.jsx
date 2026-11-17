import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// A pin drawn with CSS, so no image file has to be found by the bundler.
const pin = L.divIcon({
  className: '',
  html: '<span style="display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;background:#047857;border:2px solid #fff;transform:rotate(-45deg);box-shadow:0 1px 4px rgba(0,0,0,.45)"></span>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
  popupAnchor: [0, -20],
});

const INDIA = [20.59, 78.96];

/** Zooms to fit every pin: close for one, wide enough for all of them for several. */
function Fit({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 13);
    else if (points.length > 1) map.fitBounds(points, { padding: [32, 32], maxZoom: 14 });
  }, [map, points]);
  return null;
}

/**
 * A map of places on OpenStreetMap tiles. `markers` are `{ id, position: [lat, lng], title, subtitle, to }`. A pin opens a card
 * with a link to the place. The map is a picture of what the list already says, so it is never the only way to reach anything
 * (keyboard and screen-reader users have the list), and the credit OpenStreetMap asks for is always shown.
 */
export default function MapView({ markers, label, height = '30rem' }) {
  const points = useMemo(() => markers.map((m) => m.position), [markers]);
  return (
    <div role="region" aria-label={label} className="overflow-hidden rounded-3xl border border-black/10 dark:border-white/10" style={{ height }}>
      <MapContainer center={points[0] || INDIA} zoom={points[0] ? 12 : 5} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit points={points} />
        {markers.map((m) => (
          <Marker key={m.id} position={m.position} icon={pin} title={m.title}>
            <Popup>
              <strong>{m.title}</strong>
              {m.subtitle && <><br />{m.subtitle}</>}
              {m.to && <><br /><Link to={m.to}>View</Link></>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}