import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Progress } from './progress';

describe('Progress', () => {
  it('renders with default value of 0', () => {
    render(<Progress data-testid="progress" />);
    const indicator = screen.getByTestId('progress').querySelector('[data-slot="progress-indicator"]');
    expect(indicator).toHaveStyle({ transform: 'translateX(-100%)' });
  });

  it('renders with specified value', () => {
    render(<Progress value={50} data-testid="progress" />);
    const indicator = screen.getByTestId('progress').querySelector('[data-slot="progress-indicator"]');
    expect(indicator).toHaveStyle({ transform: 'translateX(-50%)' });
  });

  it('renders with 100% value', () => {
    render(<Progress value={100} data-testid="progress" />);
    const indicator = screen.getByTestId('progress').querySelector('[data-slot="progress-indicator"]');
    expect(indicator).toHaveStyle({ transform: 'translateX(-0%)' });
  });

  it('has correct base classes', () => {
    render(<Progress data-testid="progress" />);
    const progress = screen.getByTestId('progress');
    expect(progress).toHaveClass('relative');
    expect(progress).toHaveClass('h-2');
    expect(progress).toHaveClass('overflow-hidden');
    expect(progress).toHaveClass('rounded-full');
  });

  it('accepts custom className', () => {
    render(<Progress className="custom-class" data-testid="progress" />);
    expect(screen.getByTestId('progress')).toHaveClass('custom-class');
  });

  it('indicator has correct classes', () => {
    render(<Progress value={50} data-testid="progress" />);
    const indicator = screen.getByTestId('progress').querySelector('[data-slot="progress-indicator"]');
    expect(indicator).toHaveClass('bg-primary');
    expect(indicator).toHaveClass('h-full');
    expect(indicator).toHaveClass('w-full');
  });
});
