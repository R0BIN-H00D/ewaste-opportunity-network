import { Link } from 'react-router-dom';
import { BatteryCharging, Cpu, Laptop, Recycle, Smartphone } from 'lucide-react';

const CHIPS = [
  { icon: Laptop, label: 'Laptop · Repair', pos: 'left-0 top-8', motion: 'float-slow' },
  { icon: Smartphone, label: 'Phone · Donate', pos: 'right-0 top-24', motion: 'float-slower' },
  { icon: Cpu, label: 'Circuit board · Recycle', pos: 'left-4 bottom-20', motion: 'float-slower' },
  { icon: BatteryCharging, label: 'Battery · Safe disposal', pos: 'right-2 bottom-4', motion: 'float-slow' },
];

/** Illustration built from CSS/SVG shapes so it is sharp at any size and needs no image download. */
function HeroArt() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-md" aria-hidden>
      <div className="absolute inset-6 rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, rgba(163,230,53,.55), rgba(16,185,129,.35) 45%, rgba(20,83,45,.35) 75%)', boxShadow: '0 0 80px rgba(163,230,53,.35)' }} />
      <div className="absolute inset-16 grid place-items-center rounded-full glass-strong">
        <Recycle className="text-primary dark:text-primary-tint" size={96} strokeWidth={1.5} />
      </div>
      {CHIPS.map((chip) => {
        const Icon = chip.icon;
        return (
          <div key={chip.label} className={`glass-subtle absolute flex items-center gap-2 px-3 py-2 text-xs font-semibold text-ink dark:text-white ${chip.pos} ${chip.motion}`}>
            <Icon size={16} className="text-secondary-strong dark:text-primary-tint" /> {chip.label}
          </div>
        );
      })}
    </div>
  );
}

export default function Hero() {
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:py-24" aria-labelledby="hero-title">
      <div>
        <span className="glass-subtle inline-block px-3 py-1 text-xs font-semibold text-primary dark:text-primary-tint">Circular economy platform</span>
        <h1 id="hero-title" className="mt-4 text-4xl font-extrabold leading-tight text-ink dark:text-white sm:text-6xl">
          Give Your Electronics a Second Life.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-ink-muted dark:text-[#9FB2A7]">
          Transform electronic waste into opportunities through repair, reuse, donation and responsible recycling.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/list-device" className="btn btn-primary">List Your E-Waste</Link>
          <Link to="/opportunities" className="btn btn-glass">Explore Opportunities</Link>
        </div>
      </div>
      <HeroArt />
    </section>
  );
}
