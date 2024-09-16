import { Construct } from "constructs";
import { Tags } from 'aws-cdk-lib';
import * as ec2 from "aws-cdk-lib/aws-ec2";

export interface QSNetworkProps {
    stackName: string;
    vpcCidr: ec2.IIpAddresses;
}

export interface IQSNetwork {
    readonly vpc: ec2.IVpc;

    /**
     * Security group to be used by RDS databases and tools that need to work with them
     */
    tenantDatabaseSecurityGroup: ec2.ISecurityGroup;

    publicTenantSubnets(): ec2.ISubnet[];
    privateTenantSubnets(): ec2.ISubnet[];

    publicInfraSubnets(): ec2.ISubnet[];
    privateInfraSubnets(): ec2.ISubnet[];
}

abstract class QSNetworkBase extends Construct implements IQSNetwork {

    private readonly stackName: string;

    public abstract readonly vpc: ec2.IVpc;
    public abstract readonly tenantDatabaseSecurityGroup: ec2.ISecurityGroup;

    public constructor(scope: Construct, id: string, stackName: string) {
        super(scope, id);
        this.stackName = stackName;
    }

    protected publicTenantSubnetGroupName(): string {
        return `${this.stackName}-TenantPublic`;
    }

    protected privateTenantSubnetGroupName(): string {
        return `${this.stackName}-TenantPrivate`;
    }

    protected publicInfraSubnetGroupName(): string {
        return `${this.stackName}-InfraPublic`;
    }

    protected privateInfraSubnetGroupName(): string {
        return `${this.stackName}-InfraPrivate`;
    }

    public publicTenantSubnets(): ec2.ISubnet[] {
        return this.vpc.selectSubnets({
            subnetGroupName: this.publicTenantSubnetGroupName()
        }).subnets;
    }

    public privateTenantSubnets(): ec2.ISubnet[] {
        return this.vpc.selectSubnets({
            subnetGroupName: this.privateTenantSubnetGroupName()
        }).subnets;
    }

    public publicInfraSubnets(): ec2.ISubnet[] {
        return this.vpc.selectSubnets({
            subnetGroupName: this.publicInfraSubnetGroupName()
        }).subnets;
    }

    public privateInfraSubnets(): ec2.ISubnet[] {
        return this.vpc.selectSubnets({
            subnetGroupName: this.privateInfraSubnetGroupName()
        }).subnets;
    }

}

export class QSNetworkMain extends QSNetworkBase {

    public readonly vpc: ec2.IVpc;
    public readonly tenantDatabaseSecurityGroup: ec2.ISecurityGroup;

    public constructor(scope: Construct, id: string, props: QSNetworkProps) {
        super(scope, id, props.stackName);

        this.vpc = new ec2.Vpc(this, "Vpc", {
            vpcName: `${props.stackName}-vpc`,
            ipAddresses: props.vpcCidr,
            maxAzs: 2, // Default is all AZs in region
            restrictDefaultSecurityGroup: true,
            subnetConfiguration: [
                {
                    cidrMask: 21,
                    name: this.publicInfraSubnetGroupName(),
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 20,
                    name: this.privateInfraSubnetGroupName(),
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
                {
                    cidrMask: 20,
                    name: this.publicTenantSubnetGroupName(),
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 19,
                    name: this.privateTenantSubnetGroupName(),
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
            ],
            natGatewaySubnets: {
                subnetGroupName: this.publicInfraSubnetGroupName()
            },
            gatewayEndpoints: {
                "s3": {
                    service: ec2.GatewayVpcEndpointAwsService.S3
                },
                "dynamoDB": {
                    service: ec2.GatewayVpcEndpointAwsService.DYNAMODB
                }
            }
        });
        this.tenantDatabaseSecurityGroup = new ec2.SecurityGroup(this, "TenantDatabaseSecGroup", {
            vpc: this.vpc,
            securityGroupName: `${props.stackName}-tenant-database`,
            allowAllOutbound: false,
            description: "SG for all tenant databases to allow connectivity from Beam infrastructure and Kubernetes"
        });

        this.privateInfraSubnets().forEach(subnet => {
            Tags.of(subnet).add("ecsNetworkCluster/subnet-usage", "infrastructure");
        });
        this.publicInfraSubnets().forEach(subnet => {
            Tags.of(subnet).add("ecsNetworkCluster/subnet-usage", "infrastructure");
        });
        this.privateTenantSubnets().forEach(subnet => {
            Tags.of(subnet).add("ecsNetworkCluster/subnet-usage", "tenant");
        });
        this.publicTenantSubnets().forEach(subnet => {
            Tags.of(subnet).add("ecsNetworkCluster/subnet-usage", "tenant");
        });
    }

    public static fromVpcId(scope: Construct, id: string, stackName: string, vpcId: string): IQSNetwork {
        return new LookedUpNetwork(scope, id, stackName, vpcId);
    }
}

class LookedUpNetwork extends QSNetworkBase {

    public readonly vpc: ec2.IVpc;
    public readonly tenantDatabaseSecurityGroup: ec2.ISecurityGroup;

    constructor(scope: Construct, id: string, stackName: string, vpcId: string) {
        super(scope, id, stackName);

        this.vpc = ec2.Vpc.fromLookup(this, "Vpc", {
            vpcId: vpcId
        });
        this.tenantDatabaseSecurityGroup = ec2.SecurityGroup.fromLookupByName(this, "TenantDatabaseSecGroup",
            `${stackName}-tenant-database`, this.vpc);
    }
}
