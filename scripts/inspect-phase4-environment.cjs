const path = require('node:path');
const dotenv = require('dotenv');
const { Client } = require('pg');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DIRECT_URL ou DATABASE_URL nao configurada.');
  }

  const url = new URL(connectionString);
  const client = new Client({
    connectionString,
    ssl: url.hostname === 'localhost' ? undefined : { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`
      SELECT
        current_database() AS database,
        current_schema() AS schema,
        (SELECT count(*)::int
           FROM _prisma_migrations
          WHERE finished_at IS NOT NULL
            AND rolled_back_at IS NULL) AS applied_migrations,
        (SELECT count(*)::int FROM processos) AS process_count,
        (SELECT count(*)::int
           FROM processos
          WHERE status_processo = 'EM_EXECUCAO') AS active_process_count,
        (SELECT count(*)::int FROM usuarios) AS user_count,
        (SELECT count(*)::int
           FROM sensores
          WHERE excluido_em IS NULL) AS sensor_count,
        (SELECT count(*)::int
           FROM sensores
          WHERE excluido_em IS NULL
            AND fator_calibracao IS NULL) AS sensors_without_calibration_factor,
        (SELECT count(*)::int
           FROM sensores
          WHERE excluido_em IS NULL
            AND fator_calibracao = 0) AS sensors_with_zero_calibration_factor,
        (SELECT count(*)::int
           FROM usuarios
          WHERE lower(login) IN ('admin', 'tecnico', 'operador')) AS validation_user_count,
        (SELECT max(criado_em) FROM processos) AS latest_process_at
    `);
    const mqttResult = await client.query(`
      SELECT broker_url, porta, ativo, status_conexao,
             reconexao_automatica, ultima_sincronizacao
        FROM mqttconfiguracoes
       WHERE chave_configuracao = 'MQTT_PRINCIPAL'
       LIMIT 1
    `);
    await client.query('ROLLBACK');

    const mqttRecord = mqttResult.rows[0];
    let mqttBroker = null;
    if (mqttRecord?.broker_url) {
      const brokerUrl = new URL(mqttRecord.broker_url);
      mqttBroker = {
        protocol: brokerUrl.protocol,
        host: brokerUrl.hostname,
        port: mqttRecord.porta,
        active: mqttRecord.ativo,
        connection_status: mqttRecord.status_conexao,
        automatic_reconnection: mqttRecord.reconexao_automatica,
        last_sync_at: mqttRecord.ultima_sincronizacao,
      };
    }

    console.log(
      JSON.stringify(
        {
          environment: process.env.NODE_ENV || 'NAO_INFORMADO',
          host: url.hostname,
          database: result.rows[0].database,
          schema: result.rows[0].schema,
          applied_migrations: result.rows[0].applied_migrations,
          process_count: result.rows[0].process_count,
          active_process_count: result.rows[0].active_process_count,
          user_count: result.rows[0].user_count,
          sensor_count: result.rows[0].sensor_count,
          sensors_without_calibration_factor:
            result.rows[0].sensors_without_calibration_factor,
          sensors_with_zero_calibration_factor:
            result.rows[0].sensors_with_zero_calibration_factor,
          validation_user_count: result.rows[0].validation_user_count,
          latest_process_at: result.rows[0].latest_process_at,
          mqtt_broker: mqttBroker,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
