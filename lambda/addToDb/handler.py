import json
import boto3

def lambda_handler(event, context):
    db = boto3.resource("dynamodb")
    table = db.Table("DataIngestionApproverStack-UserTableBD4BF69E-FQL9EYOZVGTL")
    
    response = table.put_item(
        Item = {
            "id": event["email"],
            "user_name":event["user_name"],
            "pincode":event["pincode"]
        }    
    )
    
    
    return {
        'statusCode': 200,
        'body': json.dumps('Hello from Lambda!')
    }
