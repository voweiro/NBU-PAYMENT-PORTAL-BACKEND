class DashboardController {
  constructor(paymentModel, feeModel, programModel) {
    this.paymentModel = paymentModel;
    this.feeModel = feeModel;
    this.programModel = programModel;
  }

  async getAnalytics(req, res) {
    try {
      // Get range from query params (default to 'month')
      const { range } = req.query;
      const now = new Date();
      
      let currentPeriodStart, previousPeriodStart, previousPeriodEnd;
      const currentDay = now.getDate();

      switch(range) {
        case 'today':
          currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          previousPeriodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
          // Compare vs Yesterday same time
          previousPeriodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, now.getHours(), now.getMinutes());
          break;
        case 'week':
          const dayOfWeek = now.getDay(); // 0 is Sunday
          currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
          previousPeriodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek - 7);
          previousPeriodEnd = new Date(previousPeriodStart.getTime() + (now.getTime() - currentPeriodStart.getTime()));
          break;
        case 'year':
          currentPeriodStart = new Date(now.getFullYear(), 0, 1);
          previousPeriodStart = new Date(now.getFullYear() - 1, 0, 1);
          previousPeriodEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
          break;
        case 'month':
        default:
          currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), 1);
          previousPeriodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          previousPeriodEnd = new Date(now.getFullYear(), now.getMonth() - 1, currentDay, 23, 59, 59);
          break;
      }

      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);

      // Get all payments
      const allPayments = await this.paymentModel.listAll();
      const successfulPayments = allPayments.filter(p => String(p.status).toUpperCase() === 'SUCCESSFUL');
      const pendingPayments = allPayments.filter(p => String(p.status).toUpperCase() === 'PENDING');

      // Current Period stats
      const currentPeriodPayments = successfulPayments.filter(p => 
        new Date(p.createdAt) >= currentPeriodStart
      );
      
      // Previous Period stats (for trend)
      const previousPeriodPayments = successfulPayments.filter(p => 
        new Date(p.createdAt) >= previousPeriodStart &&
        new Date(p.createdAt) <= previousPeriodEnd
      );

      // Calculate totals
      const totalRevenue = successfulPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const totalPayments = successfulPayments.length;
      const totalPending = pendingPayments.length;

      const currentPeriodRevenue = currentPeriodPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const previousPeriodRevenue = previousPeriodPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      // Calculate percentage changes
      const revenueChange = previousPeriodRevenue > 0 
        ? ((currentPeriodRevenue - previousPeriodRevenue) / previousPeriodRevenue) * 100 
        : currentPeriodRevenue > 0 ? 100 : 0;
        
      const paymentsChange = previousPeriodPayments.length > 0 
        ? ((currentPeriodPayments.length - previousPeriodPayments.length) / previousPeriodPayments.length) * 100 
        : currentPeriodPayments.length > 0 ? 100 : 0;

      // Get previous period pending count for comparison
      const previousPeriodPending = allPayments.filter(p => 
        String(p.status).toUpperCase() === 'PENDING' && 
        new Date(p.createdAt) >= previousPeriodStart && 
        new Date(p.createdAt) <= previousPeriodEnd
      ).length;
      
      const pendingChange = previousPeriodPending > 0 
        ? ((totalPending - previousPeriodPending) / previousPeriodPending) * 100 
        : 0;

      // Generate revenue chart data (last 6 months)
      const revenueChart = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const monthPayments = successfulPayments.filter(p => {
          const paymentDate = new Date(p.createdAt);
          return paymentDate >= monthStart && paymentDate < monthEnd;
        });
        const monthRevenue = monthPayments.reduce((sum, p) => sum + Number(p.amount), 0);
        
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
          const paymentDate = new Date(p.createdAt);
          return paymentDate >= monthStart && paymentDate < monthEnd;
        });
        
        paymentsChart.push({
          label: monthStart.toLocaleDateString('en-US', { month: 'short' }),
          value: monthPayments.length
        });
      }

      // Get programs chart data
      // const programs = await this.programModel.getAll();
      const programs = []; // Placeholder until we can fetch from academic-service
      const programsChart = [];
      
      /* 
      // Logic disabled until we can fetch programs from academic-service
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
      */

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