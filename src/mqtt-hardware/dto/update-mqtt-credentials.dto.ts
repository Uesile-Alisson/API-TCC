import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateMqttCredentialsDTO {
  @ApiProperty({
    example: 'tsea_backend',
    minLength: 1,
    maxLength: 256,
    description:
      'Usuario MQTT gravado exclusivamente no arquivo seguro externo.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  @Matches(/\S/u, { message: 'usuario_mqtt nao pode conter apenas espacos.' })
  @Matches(/^[\P{Cc}]+$/u, {
    message: 'usuario_mqtt contem caracteres de controle invalidos.',
  })
  usuario_mqtt!: string;

  @ApiProperty({
    example: 'SENHA_NAO_EXIBIDA',
    minLength: 1,
    maxLength: 512,
    writeOnly: true,
    description:
      'Senha MQTT gravada exclusivamente no arquivo seguro externo e nunca retornada pela API.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  @Matches(/\S/u, { message: 'senha_mqtt nao pode conter apenas espacos.' })
  @Matches(/^[\P{Cc}]+$/u, {
    message: 'senha_mqtt contem caracteres de controle invalidos.',
  })
  senha_mqtt!: string;
}
