import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CertificateDownload from '../components/learning/CertificateDownload';
import { saveBlob } from '../lib/download';
import { certificateApi } from '../services/learningApi';

vi.mock('../services/learningApi', () => ({ certificateApi: { download: vi.fn() } }));
vi.mock('../lib/download', () => ({ saveBlob: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe('CertificateDownload', () => {
  it('asks the server for the PDF and saves it under the name the server gave', async () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    certificateApi.download.mockResolvedValue({ blob, filename: 'certificate-CERT-2026-ABC123.pdf' });
    render(<CertificateDownload id="c1" certNo="CERT-2026-ABC123" />);
    fireEvent.click(screen.getByRole('button', { name: 'Download certificate CERT-2026-ABC123 as PDF' }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'certificate-CERT-2026-ABC123.pdf'));
    expect(certificateApi.download).toHaveBeenCalledWith('c1');
  });

  it('shows the button as busy while the file is on its way', async () => {
    let finish;
    certificateApi.download.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<CertificateDownload id="c1" certNo="CERT-2026-ABC123" />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('Preparing...')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
    finish({ blob: new Blob(['x']), filename: 'c.pdf' });
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  });

  it('says why it failed and saves nothing', async () => {
    certificateApi.download.mockRejectedValue({ response: { status: 404, data: { message: 'Certificate not found' } } });
    render(<CertificateDownload id="c1" certNo="CERT-2026-ABC123" />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Certificate not found');
    expect(saveBlob).not.toHaveBeenCalled();
  });
});