import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileFallback } from './entity-graph';
import { demoGraphNodes, demoGraphEdges } from '@/lib/demo-data';

// Mock react-force-graph-2d since canvas is not available in jsdom
vi.mock('react-force-graph-2d', () => ({
  default: () => <div data-testid="force-graph-mock">ForceGraph2D</div>,
}));

// Mock next/dynamic to return the component directly
vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<{ default: React.ComponentType }>) => {
    const Component = () => <div data-testid="force-graph-mock">ForceGraph2D</div>;
    Component.displayName = 'DynamicForceGraph2D';
    return Component;
  },
}));

describe('MobileFallback', () => {
  it('renders without crashing', () => {
    render(<MobileFallback nodes={demoGraphNodes} edges={demoGraphEdges} />);
    expect(screen.getByTestId('mobile-fallback')).toBeInTheDocument();
  });

  it('shows entity count summary', () => {
    render(<MobileFallback nodes={demoGraphNodes} edges={demoGraphEdges} />);
    const orgs = demoGraphNodes.filter((n) => n.data.entityType === 'organization').length;
    const persons = demoGraphNodes.filter((n) => n.data.entityType === 'person').length;
    expect(screen.getByText(`${orgs} organizations, ${persons} persons, ${demoGraphEdges.length} relationships`)).toBeInTheDocument();
  });

  it('renders Organizations and People sections', () => {
    render(<MobileFallback nodes={demoGraphNodes} edges={demoGraphEdges} />);
    expect(screen.getByText('Organizations')).toBeInTheDocument();
    expect(screen.getByText('People')).toBeInTheDocument();
  });

  it('renders all organization nodes', () => {
    render(<MobileFallback nodes={demoGraphNodes} edges={demoGraphEdges} />);
    const orgs = demoGraphNodes.filter((n) => n.data.entityType === 'organization');
    orgs.forEach((org) => {
      expect(screen.getByText(org.label)).toBeInTheDocument();
    });
  });

  it('renders all person nodes', () => {
    render(<MobileFallback nodes={demoGraphNodes} edges={demoGraphEdges} />);
    const persons = demoGraphNodes.filter((n) => n.data.entityType === 'person');
    persons.forEach((person) => {
      expect(screen.getByText(person.label)).toBeInTheDocument();
    });
  });

  it('expands node to show relationships on click', () => {
    render(<MobileFallback nodes={demoGraphNodes} edges={demoGraphEdges} />);
    // Click first org node to expand
    const orgNode = demoGraphNodes.find((n) => n.data.entityType === 'organization')!;
    fireEvent.click(screen.getByText(orgNode.label));
    // Should show relationship labels for connected edges
    const connectedEdges = demoGraphEdges.filter(
      (e) => e.source === orgNode.id || e.target === orgNode.id
    );
    connectedEdges.forEach((edge) => {
      expect(screen.getByText(edge.label)).toBeInTheDocument();
    });
  });

  it('renders with empty data without crashing', () => {
    render(<MobileFallback nodes={[]} edges={[]} />);
    expect(screen.getByTestId('mobile-fallback')).toBeInTheDocument();
    expect(screen.getByText('0 organizations, 0 persons, 0 relationships')).toBeInTheDocument();
  });
});
