class DashboardController {
  constructor(paymentModel, feeModel, programModel) {
    this.paymentModel = paymentModel;
    this.feeModel = feeModel;
    this.programModel = programModel;
  }

  async getAnalytics(req, res) {
    try {
      // Get current date and previous month for comparison
      const now = new Date();
      const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

      // Get all payments
      const allPayments = await this.paymentModel.listAll();
      const successfulPayments = allPayments.filter(p => p.status === 'successful');
      const pendingPayments = allPayments.filter(p => p.status === 'pending');

      // Current month stats
      const currentMonthPayments = successfulPayments.filter(p => 
        new Date(p.payment_date) >= currentMonth
      );
      const previousMonthPayments = successfulPayments.filter(p => 
        new Date(p.payment_date) >= previousMonth && new Date(p.payment_date) < currentMonth
      );

      // Calculate totals
      const totalRevenue = successfulPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
      const totalPayments = successfulPayments.length;
      const totalPending = pendingPayments.length;

      const currentMonthRevenue = currentMonthPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
      const previousMonthRevenue = previousMonthPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);

      // Calculate percentage changes
      const revenueChange = previousMonthRevenue > 0 
        ? ((currentMonthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100 
        : 0;
      const paymentsChange = previousMonthPayments.length > 0 
        ? ((currentMonthPayments.length - previousMonthPayments.length) / previousMonthPayments.length) * 100 
        : 0;

      // Get previous month pending count for comparison
      const previousMonthPending = allPayments.filter(p => 
        p.status === 'pending' && 
        new Date(p.payment_date) >= previousMonth && 
        new Date(p.payment_date) < currentMonth
      ).length;
      const pendingChange = previousMonthPending > 0 
        ? ((totalPending - previousMonthPending) / previousMonthPending) * 100 
        : 0;

      // Generate revenue chart data (last 6 months)
      const revenueChart = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const monthPayments = successfulPayments.filter(p => {
          const paymentDate = new Date(p.payment_date);
          return paymentDate >= monthStart && paymentDate < monthEnd;
        });
        const monthRevenue = monthPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
        
        revenueChart.push({
          label: monthStart.toLocaleDateString('en-US', { month: 'short' }),
          value: monthRevenue
        });
      }

      // Generate payments chart data (last 6 months)
      const paymentsChart = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const monthPayments = successfulPayments.filter(p => {
          const paymentDate = new Date(p.created_at);
          return paymentDate >= monthStart && paymentDate < monthEnd;
        });
        
        paymentsChart.push({
          label: monthStart.toLocaleDateString('en-US', { month: 'short' }),
          value: monthPayments.length
        });
      }

      // Get programs chart data
      const programs = await this.programModel.getAll();
      const programsChart = [];
      
      for (const program of programs) {
        const programPayments = successfulPayments.filter(p => {
          // Assuming payment has program_id or we can get it through fee relationship
          return p.program_id === program.program_id;
        });
        
        if (programPayments.length > 0) {
          programsChart.push({
            label: program.program_name,
            value: programPayments.length
          });
        }
      }

      // If we can't get program data directly from payments, get it from fees
      if (programsChart.length === 0) {
        const fees = await this.feeModel.prisma.fee.findMany();
        const programPaymentCounts = {};
        
        for (const payment of successfulPayments) {
          const fee = fees.find(f => f.fee_id === payment.fee_id);
          if (fee) {
            const program = programs.find(p => p.program_id === fee.program_id);
            if (program) {
              programPaymentCounts[program.program_name] = (programPaymentCounts[program.program_name] || 0) + 1;
            }
          }
        }
        
        Object.entries(programPaymentCounts).forEach(([name, count]) => {
          programsChart.push({ label: name, value: count });
        });
      }

      const dashboardData = {
        stats: {
          totalPayments,
          totalRevenue,
          pendingPayments: totalPending,
          revenueChange: Math.round(revenueChange * 100) / 100,
          paymentsChange: Math.round(paymentsChange * 100) / 100,
          pendingChange: Math.round(pendingChange * 100) / 100
        },
        revenueChart,
        paymentsChart,
        programsChart: programsChart.slice(0, 6) // Limit to top 6 programs
      };

      res.json(dashboardData);
    } catch (error) {
      console.error('Dashboard analytics error:', error);
      res.status(500).json({ 
        error: 'Failed to fetch dashboard analytics',
        message: error.message 
      });
    }
  }
}

module.exports = DashboardController;