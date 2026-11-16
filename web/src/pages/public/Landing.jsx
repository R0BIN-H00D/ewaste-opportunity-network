import { Link } from 'react-router-dom';
import Hero from '../../components/landing/Hero';
import { Audiences, Categories, FaqSection, HowItWorks, LatestDevices, ProviderCta, TrustStrip, useLandingData } from '../../components/landing/Sections';
import { useCategories } from '../../hooks/useCategories';

export default function Landing() {
  const { data, loading, error } = useLandingData();
  const categories = useCategories();
  return (
    <>
      <Hero />
      <TrustStrip total={error ? null : data ? data.meta.total : null} categories={categories.length} />
      <HowItWorks />
      <Categories />
      <Audiences />
      <LatestDevices data={data} loading={loading} error={error} />
      <ProviderCta />
      <FaqSection />
      <section className="mx-auto max-w-7xl px-4 pb-20 pt-4">
        <div className="glass-strong flex flex-col items-center gap-4 p-10 text-center">
          <h2 className="text-2xl font-extrabold text-ink dark:text-white sm:text-3xl">Ready to give your old devices a second life?</h2>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/list-device" className="btn btn-primary">List Your E-Waste</Link>
            <Link to="/learn" className="btn btn-glass">Learn how it works</Link>
          </div>
        </div>
      </section>
    </>
  );
}
