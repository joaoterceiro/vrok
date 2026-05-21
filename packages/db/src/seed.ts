import { db } from './client';
import { teams, users } from './schema';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('Seeding database…');

  const adminEmail = 'admin@zora.local';
  const adminPassword = 'admin';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  // Default team
  const [team] = await db
    .insert(teams)
    .values({
      name: 'Atendimento',
      slug: 'atendimento',
      color: '#fa4374',
      description: 'Setor padrão de atendimento',
    })
    .onConflictDoNothing({ target: teams.slug })
    .returning();

  // Admin user
  const [user] = await db
    .insert(users)
    .values({
      email: adminEmail,
      name: 'Administrador',
      passwordHash,
      role: 'admin',
      status: 'offline',
      isActive: true,
    })
    .onConflictDoNothing({ target: users.email })
    .returning();

  console.log('✓ Default team:', team?.name ?? '(já existia)');
  console.log('✓ Admin user:', user?.email ?? '(já existia)');
  console.log('  └ login: admin@zora.local / admin  (TROQUE A SENHA!)');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
