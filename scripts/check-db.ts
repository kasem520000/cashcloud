import { db } from "../src/lib/db";
async function main() {
  const users = await db.user.findMany({ select: { username: true, name: true, isPlatformAdmin: true } });
  console.log("USERS:", JSON.stringify(users));
  const companies = await db.company.findMany({ select: { name: true, slug: true, taxNumber: true } });
  console.log("COMPANIES:", JSON.stringify(companies));
  const products = await db.product.count();
  const sales = await db.sale.count();
  console.log("COUNTS:", JSON.stringify({ products, sales }));
  await db.$disconnect();
}
main();
