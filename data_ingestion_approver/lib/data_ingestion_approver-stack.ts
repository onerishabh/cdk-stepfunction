import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table, AttributeType } from 'aws-cdk-lib/aws-dynamodb'
import { Bucket } from 'aws-cdk-lib/aws-s3'
import { Role, ServicePrincipal, ManagedPolicy, PolicyStatement, Effect} from 'aws-cdk-lib/aws-iam'
import { Function, Code, Runtime, FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda'
import { StateMachine, Choice, Condition, Pass } from 'aws-cdk-lib/aws-stepfunctions'
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks'

export class DataIngestionApproverStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const db_tb = new Table(this, "UserTable",{
      partitionKey: {name: 'id', type: AttributeType.STRING}
    });

    const s3 = new Bucket(this, "data-ingestion-approver-bucket-new",{
    });

    const lambda_ex_role = new Role(this, "LambdaExecutionRole",{
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
      roleName: "lambda_execution_role",
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AWSLambdaExecute"), 
        ManagedPolicy.fromAwsManagedPolicyName("AmazonDynamoDBFullAccess"),
        ManagedPolicy.fromAwsManagedPolicyName("AWSStepFunctionsFullAccess"),]
    });

    const sm_access_policy = new ManagedPolicy(this, "SecretsManagerAccessPolicy",{
      statements: [new PolicyStatement({
        resources: ["arn:aws:secretsmanager:*:*:secret:*dia*"],
        actions: ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"],
        effect: Effect.ALLOW
      })]
    });

    lambda_ex_role.addManagedPolicy(ManagedPolicy.fromManagedPolicyArn(this, "SMAcccess", sm_access_policy.managedPolicyArn));

    const sf_ex_role = new Role(this, "StepFucntionExecutionRole",{
      assumedBy: new ServicePrincipal("states.amazonaws.com"),
      roleName: "sf_execution_role",
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AWSStepFunctionsFullAccess"),
        ManagedPolicy.fromAwsManagedPolicyName("AWSLambda_FullAccess")
      ]
    });

    const trigger_wf = new Function(this, "Trigger-Workflow", {
      runtime: Runtime.PYTHON_3_8,
      handler: "handler.lambda_handler",
      code: Code.fromAsset("../lambda/triggerWorkflow/"),
      role: lambda_ex_role
    });

    const func_url = trigger_wf.addFunctionUrl({
      authType: FunctionUrlAuthType.NONE
    });

    console.log(func_url.url);

    const check_email_lf = new Function(this, "Check-Email",{
      runtime: Runtime.PYTHON_3_8,
      handler: "handler.lambda_handler",
      code: Code.fromAsset("../lambda/check-email/"),
      role: lambda_ex_role
    });

    const check_pincode_lf = new Function(this, "Check-Pincode",{
      runtime: Runtime.PYTHON_3_8,
      handler: "handler.lambda_handler",
      code: Code.fromAsset("../lambda/check-pincode/"),
      role: lambda_ex_role
    });

    const addToDB_lf = new Function(this, "AddToDB",{
      runtime: Runtime.PYTHON_3_8,
      handler: "handler.lambda_handler",
      code: Code.fromAsset("../lambda/addToDb/"),
      role: lambda_ex_role
    });
    addToDB_lf.addEnvironment("TABLE", db_tb.tableName);

    const check_email_state = new LambdaInvoke(this, "CheckEmail",{
      lambdaFunction: check_email_lf,
      outputPath: '$.Payload'
    });

    const check_pincode_state = new LambdaInvoke(this, "CheckPincode",{
      lambdaFunction: check_pincode_lf,
      inputPath: "$.body",
      outputPath: '$.Payload'
    });

    const add_to_db_state = new LambdaInvoke(this, "AddToDBState",{
      lambdaFunction: addToDB_lf,
      inputPath: "$.body",
      outputPath: '$.Payload'
    })

    const fail_state_1 = new Pass(this, "Fail Address", {
      comment: "Fail Address"
    })

    const fail_state_2 = new Pass(this, "Fail Pincode", {
      comment: "Fail Address"
    })

    const choice_email = new Choice(this, "Email Check").
    when(Condition.numberEquals("$.statusCode", 400), fail_state_1).
    otherwise(check_pincode_state)

    const choice_pincode = new Choice(this, "Pincode Check").
    when(Condition.numberEquals("$.statusCode", 400), fail_state_2).
    otherwise(add_to_db_state)

    const definition = check_email_state.next(choice_email);

    check_pincode_state.next(choice_pincode);
    

    const workflow = new StateMachine(this, "Workflow",{
      definition: definition,
      role: sf_ex_role
    });

    trigger_wf.addEnvironment("STEP_FUNCTION", workflow.stateMachineArn);
    trigger_wf.addEnvironment("TABLE", db_tb.tableName);


    new CfnOutput(this, "Function URL Api", {
      value: func_url.url
    })

  }
}
