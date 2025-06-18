import db from './src/db/index.js';

db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position")
  .then(r => {
    console.log('Users table columns:');
    console.log(r.rows.map(row => row.column_name).join('\n'));
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });