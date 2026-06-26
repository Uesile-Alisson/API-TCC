export const RELATORIO_MESSAGES = {
  GENERAL: {
    LIST_LOADED: 'Relatórios carregados com sucesso.',
    DETAIL_LOADED: 'Relatório carregado com sucesso.',
    NOT_FOUND: 'Relatório não encontrado.',
  },
  GENERATION: {
    PROCESS_REPORT_CREATED: 'Relatório de processo gerado com sucesso.',
    ALARM_REPORT_CREATED: 'Relatório de alarme gerado com sucesso.',
    PROCESS_REPORTS_CREATED: 'Relatórios de processo gerados com sucesso.',
    DUPLICATED_REPORT: 'Já existe relatório gerado para este tipo e formato.',
    REPORTS_ARE_IMMUTABLE:
      'Relatórios são históricos imutáveis e não podem ser editados ou regenerados.',
  },
  PROCESS: {
    PROCESS_NOT_FOUND: 'Processo não encontrado.',
    PROCESS_NOT_FINALIZED:
      'O processo precisa estar concluído, interrompido ou em falha para gerar relatório.',
    PROCESS_INVALID_FORMAT: 'Formato inválido para relatório de processo.',
  },
  ALARM: {
    ALARM_NOT_FOUND: 'Alarme não encontrado.',
    ALARM_INVALID_FORMAT: 'Relatório de alarme aceita apenas PDF.',
    ALARM_MUST_BE_RESOLVED:
      'O alarme precisa estar resolvido para geração de relatório final.',
  },
  FORMAT: {
    INVALID_FORMAT: 'Formato de relatório inválido.',
    CSV_NOT_SUPPORTED: 'CSV não é suportado pelo módulo Relatórios.',
    PREVIEW_INVALID_FORMAT:
      'Preview está disponível apenas para relatórios em PDF ou XLSX.',
  },
  PERMISSION: {
    FORBIDDEN_GENERATE: 'Usuário sem permissão para gerar relatórios.',
    FORBIDDEN_DOWNLOAD: 'Usuário sem permissão para baixar relatórios.',
    FORBIDDEN_FILTER_USER: 'Filtro por usuário é restrito para este perfil.',
    UNKNOWN_ROLE: 'Perfil de usuário inválido ou ausente.',
  },
  STORAGE: {
    FILE_NOT_FOUND: 'Arquivo do relatório não encontrado no GridFS.',
    GRIDFS_FILE_ID_MISSING:
      'Relatório não possui identificador de arquivo no GridFS.',
    UPLOAD_FAILED: 'Falha ao salvar arquivo do relatório no GridFS.',
    DOWNLOAD_FAILED: 'Falha ao recuperar arquivo do relatório no GridFS.',
    ROLLBACK_FAILED:
      'Falha ao remover arquivo do GridFS após erro de persistência.',
    INVALID_CONTENT_TYPE: 'Tipo de conteúdo do arquivo inválido.',
    INVALID_FILE_SIZE: 'Tamanho do arquivo inválido.',
  },
  VALIDATION: {
    INVALID_DATE_RANGE: 'data_inicio não pode ser maior que data_fim.',
    INVALID_PAGINATION: 'Paginação inválida.',
    INVALID_ORDER_FIELD: 'Campo de ordenação inválido.',
    INVALID_ORDER_DIRECTION: 'Direção de ordenação inválida.',
  },
} as const;
