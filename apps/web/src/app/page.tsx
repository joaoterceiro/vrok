import { redirect } from 'next/navigation';

export default function Home() {
  // Chat-first: rota raiz sempre vai para o inbox.
  redirect('/inbox');
}
