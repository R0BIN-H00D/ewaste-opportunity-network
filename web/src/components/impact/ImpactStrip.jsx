import { Link } from 'react-router-dom';
import { Tile } from './Tiles';
import { useFetch } from '../../hooks/useFetch';
import { impactApi } from '../../services/impactApi';
import { kg, number } from '../../lib/analytics';

/**
 * Live figures on the landing page, from recorded and verified activity only (FR-IMP-006). While nothing has been verified it
 * says so rather than showing a row of zeros; if the figures cannot be fetched it shows nothing at all.
 */
export default function ImpactStrip() {
  const { data, error } = useFetch((signal) => impactApi.platform(signal), []);
  if (error || !data) return null;

  return (
    <section aria-labelledby="impact-strip-h" className="mx-auto max-w-7xl px-4 py-10">
      <h2 id="impact-strip-h" className="text-2xl font-extrabold text-ink dark:text-white">What we have achieved together</h2>
      {data.verifiedActivities === 0 ? (
        <p className="mt-2 text-ink-muted dark:text-[#9FB2A7]">No activity has been confirmed yet. The first repair, donation or recycling job to be confirmed will show up here.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Devices kept in use" value={number(data.devices.diverted)} kind="actual" />
            <Tile label="Repaired" value={number(data.devices.repaired)} kind="actual" />
            <Tile label="Donated" value={number(data.devices.donated)} kind="actual" />
            <Tile label="Weighed at recycling centres" value={kg(data.materials.measuredKg)} kind="measured" />
          </div>
          <p className="mt-3 text-sm"><Link to="/impact" className="font-semibold text-primary underline dark:text-primary-tint">See all the figures and how they are counted</Link></p>
        </>
      )}
    </section>
  );
}
