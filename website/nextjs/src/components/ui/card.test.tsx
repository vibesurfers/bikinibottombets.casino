import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';

describe('Card', () => {
  it('renders Card with all parts', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>
    );

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
    expect(screen.getByText('Footer')).toBeInTheDocument();
  });

  it('Card has correct base classes', () => {
    render(<Card data-testid="card">Content</Card>);
    const card = screen.getByTestId('card');
    expect(card).toHaveClass('rounded-xl');
    expect(card).toHaveClass('border');
    expect(card).toHaveClass('bg-card');
  });

  it('CardHeader has correct classes', () => {
    render(
      <Card>
        <CardHeader data-testid="header">Header</CardHeader>
      </Card>
    );
    expect(screen.getByTestId('header')).toHaveClass('grid');
    expect(screen.getByTestId('header')).toHaveClass('px-6');
  });

  it('CardTitle renders correctly', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle data-testid="title">My Title</CardTitle>
        </CardHeader>
      </Card>
    );
    expect(screen.getByTestId('title')).toHaveTextContent('My Title');
    expect(screen.getByTestId('title')).toHaveClass('font-semibold');
  });

  it('CardContent has correct padding', () => {
    render(
      <Card>
        <CardContent data-testid="content">Content</CardContent>
      </Card>
    );
    expect(screen.getByTestId('content')).toHaveClass('px-6');
  });

  it('CardFooter has correct classes', () => {
    render(
      <Card>
        <CardFooter data-testid="footer">Footer</CardFooter>
      </Card>
    );
    expect(screen.getByTestId('footer')).toHaveClass('flex');
    expect(screen.getByTestId('footer')).toHaveClass('items-center');
  });

  it('accepts custom className', () => {
    render(
      <Card className="custom-class" data-testid="card">
        Content
      </Card>
    );
    expect(screen.getByTestId('card')).toHaveClass('custom-class');
  });
});
