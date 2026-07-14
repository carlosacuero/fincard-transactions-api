/**
 * Punto de entrada: levanta el servidor HTTP.
 */
import { buildServer } from './infrastructure/http/server';

const PORT = Number(process.env.PORT ?? 3000);

async function main(): Promise<void> {
  const app = await buildServer({ logger: true });
  await app.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
