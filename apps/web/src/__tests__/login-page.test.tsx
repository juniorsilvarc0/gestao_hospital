import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from '@/pages/LoginPage';

describe('<LoginPage />', () => {
  function renderPage(): void {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <LoginPage />
      </MemoryRouter>,
    );
  }

  it('renderiza o título do sistema', () => {
    renderPage();
    expect(
      screen.getByRole('heading', {
        name: /HMS-BR — Hospital Management System/i,
      }),
    ).toBeInTheDocument();
  });

  it('apresenta os campos de e-mail e senha', () => {
    renderPage();
    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument();
  });

  it('exibe o botão de entrar', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument();
  });
});
