const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const serviceAccount = require('../migration/service-account.json');

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

async function run() {
  const snap = await db.collection('invoices').where('status', '==', 'paid').get();

  const rows = snap.docs.map((d) => {
    const inv = d.data();
    const ref = inv.referenceMonth ? inv.referenceMonth.toDate() : null;
    return {
      id: d.id,
      contractId: inv.contractId,
      tenantName: inv.tenantName,
      referenceMonth: ref
        ? `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, '0')}`
        : null,
      rentAmount: inv.rentAmount ?? null,
      currentRentAmount: inv.currentRentAmount ?? null,
    };
  });

  rows.sort((a, b) =>
    (a.tenantName || '').localeCompare(b.tenantName || '') ||
    (a.referenceMonth || '').localeCompare(b.referenceMonth || '')
  );

  console.log(JSON.stringify(rows, null, 2));
}

run().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});