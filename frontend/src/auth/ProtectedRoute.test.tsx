import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({ loading: false, session: null }),
}));

describe('ProtectedRoute', () => {
  it('redirects an unauthenticated visitor to login', () => {
    render(
      <MemoryRouter initialEntries={['/events']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/events" element={<span>private content</span>} />
          </Route>
          <Route path="/login" element={<span>login page</span>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('login page')).toBeInTheDocument();
    expect(screen.queryByText('private content')).not.toBeInTheDocument();
  });
});
