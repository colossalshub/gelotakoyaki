import { registerInitialOwner } from "../src/server/auth";
import { prisma } from "../src/server/db";

const name = process.env.OWNER_NAME?.trim();
const email = process.env.OWNER_EMAIL?.trim();
const password = process.env.OWNER_PASSWORD ?? "";

if (!name || !email || !password) {
  console.error("Set OWNER_NAME, OWNER_EMAIL, and OWNER_PASSWORD in the environment. They are not stored in the repository.");
  process.exit(1);
}

registerInitialOwner({ name, email, password })
  .then((owner) => {
    console.log(`Owner account created for ${owner.email}.`);
    console.log("The password was not written to disk by this script. Sign in and change it if it was a temporary value.");
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Could not create the owner.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
