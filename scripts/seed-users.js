require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const users = [
  { nom: 'Admin',     prenom: 'GADAAY',   email: 'admin@gadaay.sn',      mot_de_passe: 'Admin2026!',      role: 'admin' },
  { nom: 'Agent',     prenom: 'GADAAY',   email: 'agent@gadaay.sn',      mot_de_passe: 'Agent2026!',      role: 'agent' },
  { nom: 'Comptable', prenom: 'GADAAY',   email: 'comptable@gadaay.sn',  mot_de_passe: 'Comptable2026!',  role: 'comptable' },
];

(async () => {
  const pool = mysql.createPool({
    host    : process.env.DB_HOST,
    port    : parseInt(process.env.DB_PORT) || 3306,
    user    : process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl     : { rejectUnauthorized: false },
  });

  for (const u of users) {
    const hash = await bcrypt.hash(u.mot_de_passe, 10);
    await pool.execute(
      `INSERT INTO Utilisateur (nom, prenom, email, mot_de_passe, role)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE mot_de_passe = VALUES(mot_de_passe), role = VALUES(role)`,
      [u.nom, u.prenom, u.email, hash, u.role]
    );
    console.log(`✓ ${u.role} — ${u.email}`);
  }

  await pool.end();
  console.log('Seed terminé.');
})();
