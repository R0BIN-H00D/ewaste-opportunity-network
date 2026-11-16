import DeviceForm from '../../components/devices/DeviceForm';

export default function ListDevice() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <h1 className="mb-1 text-3xl font-extrabold text-ink dark:text-white sm:text-4xl">List your device</h1>
      <p className="mb-6 text-sm text-ink-muted dark:text-[#9FB2A7]">Give your old electronics a second life. It takes about two minutes.</p>
      <DeviceForm mode="create" />
    </div>
  );
}
