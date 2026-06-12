import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { MqttClientService } from '../connect/mqtt-client.service';
import { MqttMessage } from '../interfaces/mqtt-message.interface';
import { TopicMatcher } from '../topics/topic-matcher';
import 