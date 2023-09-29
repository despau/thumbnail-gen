import * as cdk from 'aws-cdk-lib';
import { Code, Function, LayerVersion, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { join } from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { LambdaIntegration, RestApi } from 'aws-cdk-lib/aws-apigateway';

export class ThumbnailGenStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    const table = new Table(this, 'thumb_table', {
      partitionKey: {name: 'id', type: AttributeType.STRING},
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });


    const handlerListThumbs = new Function(this, 'handler-list-thumbnails', {
       runtime: Runtime.PYTHON_3_8,
       timeout: cdk.Duration.seconds(20),
       memorySize: 512,
       handler: 'app.s3_get_thumb_urls',
       code: Code.fromAsset(join(__dirname, '../lambdas')),
       layers: [
        LayerVersion.fromLayerVersionArn(
          this,
          "PIL-2",
          "arn:aws:lambda:us-east-2:770693421928:layer:Klayers-python38-Pillow:15"
        )
       ],
       environment: {
        REGION_NAME: 'us-east-2',
        THUMBNAIL_SIZE: '128',
        MY_TABLE: table.tableName
       }
    });

    table.grantReadData(handlerListThumbs);


    const handler = new Function(this, 'handler-resize-img', {
      runtime: Runtime.PYTHON_3_8,
      timeout: cdk.Duration.seconds(20),
      handler: 'app.s3_thumbnail_gen',
      code: Code.fromAsset(join(__dirname, '../lambdas')),
      layers: [
       LayerVersion.fromLayerVersionArn(
         this,
         "PIL",
         "arn:aws:lambda:us-east-2:770693421928:layer:Klayers-python38-Pillow:15"
       )
      ],
      environment: {
       REGION_NAME: 'us-east-2',
       THUMBNAIL_SIZE: '128',
       MY_TABLE: table.tableName
      }
   });

    
    table.grantReadWriteData(handler)


    const s3Bucket = new s3.Bucket(this, 'photo-bucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });


    s3Bucket.grantReadWrite(handler);


    s3Bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED, 
      new s3n.LambdaDestination(handler) 
    );


    handler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:*'],
        resources: ['*']
      })
    );


    //rest api
    const thumbsApi = new RestApi(this, 'thumbs-api', {
      description: "Api to list db thumbs"
    });


    //lambda integration
    const handlerApiIntegration = new LambdaIntegration(handlerListThumbs, { requestTemplates: { "applications/json" : '{ "statusCode ": "200 }'}});

    const mainPath = thumbsApi.root.addResource('images');
    mainPath.addMethod("GET", handlerApiIntegration)

    
  }
}


