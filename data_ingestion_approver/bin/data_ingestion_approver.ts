#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DataIngestionApproverStack } from '../lib/data_ingestion_approver-stack';

const app = new cdk.App();
new DataIngestionApproverStack(app, 'DataIngestionApproverStack');