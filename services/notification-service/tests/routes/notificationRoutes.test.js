const express = require('express');
const request = require('supertest');
const notificationRoutes = require('../../src/routes/notificationRoutes');
const Notification = require('../../src/models/Notification');

jest.mock('../../src/models/Notification');

describe('Notification Service - Notification Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationRoutes);
  });

  it('GET /api/notifications routes to list notifications sorted and limited to 50', async () => {
    const mockList = [{ title: 'Order Paid', message: 'Success' }];
    const limitMock = jest.fn().mockResolvedValue(mockList);
    const sortMock = jest.fn().mockReturnValue({ limit: limitMock });
    Notification.find.mockReturnValue({ sort: sortMock });

    const res = await request(app).get('/api/notifications');

    expect(res.status).toBe(200);
    expect(Notification.find).toHaveBeenCalled();
    expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
    expect(limitMock).toHaveBeenCalledWith(50);
    expect(res.body).toEqual(mockList);
  });
});
