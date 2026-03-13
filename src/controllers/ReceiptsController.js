const ApiResponse = require('../utils/apiResponse');
const ReceiptService = require('../services/receiptService');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

class ReceiptsController {
  constructor(paymentModel) {
    this.paymentModel = paymentModel;
    this.s3 = new S3Client({
      region: process.env.RAILWAY_BUCKET_REGION || 'auto',
      endpoint: process.env.RAILWAY_BUCKET_ENDPOINT,
      credentials: {
        accessKeyId: process.env.RAILWAY_BUCKET_ACCESS_KEY_ID,
        secretAccessKey: process.env.RAILWAY_BUCKET_SECRET_ACCESS_KEY,
      },
      forcePathStyle: true,
    });
  }

  async generate(req, res) {
    try {
      // Support ID from params (GET /:id) or POST body ({ id })
      const idFromParams = req.params?.id;
      const idFromBody = (req.body && (req.body.id ?? req.body.payment_id)) || undefined;
      const rawId = idFromParams ?? idFromBody;
      if (rawId === undefined || rawId === null) {
        return ApiResponse.error(res, 'Payment ID is required to generate receipt', 400);
      }

      const payment = await this.paymentModel.getById(rawId);
      if (!payment) return ApiResponse.error(res, 'Payment not found', 404);
      if (payment.status !== 'SUCCESSFUL') return ApiResponse.error(res, 'Payment not successful', 400);

      const fee = await this.paymentModel.prisma.fee.findUnique({ where: { id: payment.feeId } });
      let program = null;
      if (this.paymentModel.prisma.program) {
        if (payment.programId) {
          program = await this.paymentModel.prisma.program.findUnique({ where: { programId: payment.programId } });
        }
        if (!program && fee?.programId) {
          program = await this.paymentModel.prisma.program.findUnique({ where: { programId: fee.programId } });
        }
      }
      
      let session = null;
      if (this.paymentModel.prisma.academicSession) {
        if (payment.sessionId) {
          session = await this.paymentModel.prisma.academicSession.findUnique({ where: { sessionId: payment.sessionId } });
        }
        if (!session && fee?.sessionId) {
          session = await this.paymentModel.prisma.academicSession.findUnique({ where: { sessionId: fee.sessionId } });
        }
      }

      const receipt = await ReceiptService.generateAndUploadReceipt({ payment, fee, program, session });
      await this.paymentModel.setReceiptUrlById(payment.id, receipt.driveUrl);
      return ApiResponse.ok(res, { id: rawId, receiptUrl: receipt.driveUrl });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async getLinkByPaymentId(req, res) {
    try {
      const { id } = req.params;
      const payment = await this.paymentModel.getById(id);
      if (!payment) return ApiResponse.error(res, 'Payment not found', 404);
      return ApiResponse.ok(res, { id, receiptUrl: payment.proofUrl });
    } catch (err) {
      return ApiResponse.error(res, err);
    }
  }

  async serveReceipt(req, res) {
    try {
      const { id } = req.params;
      const payment = await this.paymentModel.getById(id);
      if (!payment) return ApiResponse.error(res, 'Payment not found', 404);
      if (payment.status !== 'SUCCESSFUL') return ApiResponse.error(res, 'Payment not successful', 400);
      
      const proofUrl = payment.proofUrl;
      if (!proofUrl) return ApiResponse.error(res, 'Receipt not available', 404);
      
      // Extract filename from the URL
      try {
        const urlPath = new URL(proofUrl).pathname;
        const filename = urlPath.split('/').pop();
        
        if (!filename) return ApiResponse.error(res, 'Invalid receipt URL', 400);
        
        // Generate a user-friendly filename
        const sanitizedRef = payment.reference.replace(/[^a-zA-Z0-9-_]/g, '_');
        const downloadFilename = `NBU-Receipt-${sanitizedRef}.pdf`;
        
        // Generate presigned URL for secure access
        const command = new GetObjectCommand({
          Bucket: process.env.RAILWAY_BUCKET_NAME,
          Key: filename,
        });
        
        const presignedUrl = await getSignedUrl(this.s3, command, { expiresIn: 3600 }); // 1 hour
        
        // Fetch the file from S3 and stream it to the client
        const fileResponse = await fetch(presignedUrl);
        
        if (!fileResponse.ok) {
          throw new Error('Failed to fetch receipt from S3');
        }
        
        // Set headers for file download
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
        res.setHeader('Cache-Control', 'no-cache');
        
        // Stream the file to the client
        const arrayBuffer = await fileResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        return res.send(buffer);
        
      } catch (urlError) {
        console.error('URL parsing or fetch error:', urlError);
        return ApiResponse.error(res, 'Failed to fetch receipt', 500);
      }
    } catch (err) {
      console.error('Serve receipt error:', err);
      return ApiResponse.error(res, 'Failed to serve receipt', 500);
    }
  }
}

module.exports = ReceiptsController;
