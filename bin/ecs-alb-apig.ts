#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcsAlbApigStack } from '../lib/ecs-alb-apig-stack';

const app = new cdk.App();
new EcsAlbApigStack(app, 'EcsAlbApigStack', {
  env : {region : 'us-east-1'}
});