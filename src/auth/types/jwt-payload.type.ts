export type JwtPayload = {
  sub: number;
  login: string;
  id_nivel_acesso: number;
  nivel_acesso: 'OPERADOR' | 'TECNICO' | 'ADMINISTRADOR';
};
