import { render, screen } from '@testing-library/react';
import { Recycle } from 'lucide-react';
import Art, { ART_NAMES } from '../components/art/Illustrations';
import EmptyState from '../components/ui/EmptyState';

describe('illustrations', () => {
  it('has every drawing hidden from screen readers and coloured by the theme', () => {
    expect(ART_NAMES.length).toBeGreaterThanOrEqual(8);
    for (const name of ART_NAMES) {
      const { container, unmount } = render(<Art name={name} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('viewBox', '0 0 160 120');
      expect(container.innerHTML).toContain('currentColor');
      expect(container.innerHTML).not.toMatch(/<image|href=|<script|on[a-z]+=/i); // drawn in code: nothing to fetch, nothing to run
      unmount();
    }
  });

  it('draws nothing for a name that does not exist', () => {
    const { container } = render(<Art name="nope" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('EmptyState', () => {
  it('shows the drawing in place of the icon tile when it has one, and keeps the words', () => {
    const { container } = render(<EmptyState icon={Recycle} art="recycle" title="Nothing yet">Come back soon.</EmptyState>);
    expect(container.querySelector('[data-art="recycle"]')).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(1); // the drawing only, not the icon as well
    expect(screen.getByRole('heading', { name: 'Nothing yet' })).toBeInTheDocument();
    expect(screen.getByText('Come back soon.')).toBeInTheDocument();
  });

  it('falls back to the small icon without art', () => {
    const { container } = render(<EmptyState icon={Recycle} title="Nothing yet" />);
    expect(container.querySelector('[data-art]')).toBeNull();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
