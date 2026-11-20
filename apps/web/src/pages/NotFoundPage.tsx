import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section aria-labelledby="page-title">
      <h1 id="page-title">Página não encontrada</h1>
      <p className="page-intro">O endereço acessado não existe neste aplicativo.</p>
      <Link to="/" className="btn btn-primary">
        Voltar ao início
      </Link>
    </section>
  );
}
