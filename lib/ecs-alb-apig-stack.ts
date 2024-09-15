import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as apigateway from "aws-cdk-lib/aws-apigateway";

export class EcsAlbApigStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "Test-ECS-VPC", {
      //maxAzs: 2, // Default is all AZs in the region
      availabilityZones: ['us-east-1a', 'us-east-1b']
    });
    // Create an ECS cluster
    const cluster = new ecs.Cluster(this, "Test-ECS-Cluster", {
      vpc: vpc,
    });

    // Create a Fargate service and load balancer
    const fargateService =
      new ecs_patterns.NetworkLoadBalancedFargateService(
        this,
        "Test-ECS-FargateService",
        {
          cluster: cluster,
          taskImageOptions: {
            image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
          },
          publicLoadBalancer: true
        }
      );

    // Create an API Gateway
    const api = new apigateway.RestApi(this, "Test-ECS-Api", {
      restApiName: "Test-ECS-Service",
      description: "This service serves Test ECS container.",
    });

    // Create a VPC Link
    const vpcLink = new apigateway.VpcLink(this, "Test-ECS-VpcLink", {
      targets: [fargateService.loadBalancer],
    });

    // Create an API Gateway resource and method
    const integration = new apigateway.Integration({
      type: apigateway.IntegrationType.HTTP_PROXY,
      integrationHttpMethod: "ANY",
      uri: `http://${fargateService.loadBalancer.loadBalancerDnsName}`,
      options: {
        connectionType: apigateway.ConnectionType.VPC_LINK,
        vpcLink: vpcLink,
      },
    });

    api.root.addMethod("ANY", integration);
  }
}
