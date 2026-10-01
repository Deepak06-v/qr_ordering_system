import { api, createTheater } from './helpers';

describe('Theater API', () => {
  describe('POST /api/theaters', () => {
    it('creates a theater and returns 201 with the resource', async () => {
      const response = await api().post('/api/theaters').send({
        name: 'Demo Cinema',
        address: '12 Marathahalli Road',
        city: 'Bengaluru',
      });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        data: {
          name: 'Demo Cinema',
          city: 'Bengaluru',
          timezone: 'Asia/Kolkata',
          isActive: true,
        },
      });
      expect(response.body.data.id).toMatch(/^[a-f0-9]{24}$/);
      expect(response.body.data.createdAt).toBeDefined();
    });

    it('rejects a theater with no name (400 VALIDATION_ERROR)', async () => {
      const response = await api().post('/api/theaters').send({ city: 'Bengaluru' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: 'name' })]),
      );
    });

    it('rejects a blank name and an invalid timezone', async () => {
      const blank = await api().post('/api/theaters').send({ name: '   ' });
      expect(blank.status).toBe(400);

      const badTimezone = await api()
        .post('/api/theaters')
        .send({ name: 'Demo Cinema', timezone: 'Mars/Olympus_Mons' });
      expect(badTimezone.status).toBe(400);
      expect(badTimezone.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unknown fields (strict schema)', async () => {
      const response = await api()
        .post('/api/theaters')
        .send({ name: 'Demo Cinema', adminSecret: 'nope' });

      expect(response.status).toBe(400);
    });

    it('honours an explicit isActive: false', async () => {
      const response = await api()
        .post('/api/theaters')
        .send({ name: 'Closed Cinema', isActive: false });

      expect(response.status).toBe(201);
      expect(response.body.data.isActive).toBe(false);
    });

    it('rejects a duplicate name (409 THEATER_DUPLICATE)', async () => {
      await createTheater({ name: 'PVR Nexus' });

      const response = await api().post('/api/theaters').send({ name: 'PVR Nexus' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('THEATER_DUPLICATE');
    });

    it('treats the duplicate name check as case-insensitive', async () => {
      await createTheater({ name: 'PVR Nexus' });

      const response = await api().post('/api/theaters').send({ name: 'pvr NEXUS' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('THEATER_DUPLICATE');
    });

    it('allows the same name in a different casing-free form after a rename', async () => {
      const theater = await createTheater({ name: 'Inox Lite' });

      const renamed = await api()
        .patch(`/api/theaters/${theater.id}`)
        .send({ name: 'Inox Lite Multiplex' });
      expect(renamed.status).toBe(200);

      const recreated = await api().post('/api/theaters').send({ name: 'Inox Lite' });
      expect(recreated.status).toBe(201);
    });
  });

  describe('GET /api/theaters/:id', () => {
    it('retrieves a theater that exists', async () => {
      const theater = await createTheater({ name: 'PVR Nexus' });

      const response = await api().get(`/api/theaters/${theater.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ id: theater.id, name: 'PVR Nexus' });
    });

    it('returns 404 THEATER_NOT_FOUND for an unknown id', async () => {
      const response = await api().get('/api/theaters/64b7f9c2e13f2a1b2c3d4e5f');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: { code: 'THEATER_NOT_FOUND', message: 'Theater not found' },
      });
    });

    it('returns 400 for a malformed ObjectId', async () => {
      const response = await api().get('/api/theaters/not-an-object-id');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/theaters/:id', () => {
    it('updates a theater', async () => {
      const theater = await createTheater();

      const response = await api()
        .patch(`/api/theaters/${theater.id}`)
        .send({ city: 'Mumbai', isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ city: 'Mumbai', isActive: false });
    });

    it('rejects an empty patch', async () => {
      const theater = await createTheater();
      const response = await api().patch(`/api/theaters/${theater.id}`).send({});

      expect(response.status).toBe(400);
    });

    it('returns 404 for an unknown theater', async () => {
      const response = await api()
        .patch('/api/theaters/64b7f9c2e13f2a1b2c3d4e5f')
        .send({ city: 'Mumbai' });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('THEATER_NOT_FOUND');
    });

    it('rejects renaming onto an existing theater name (409)', async () => {
      await createTheater({ name: 'Cinepolis One' });
      const theater = await createTheater({ name: 'Cinepolis Two' });

      const response = await api()
        .patch(`/api/theaters/${theater.id}`)
        .send({ name: 'Cinepolis One' });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('THEATER_DUPLICATE');
    });

    it('allows a rename that only changes the casing of its own name', async () => {
      const theater = await createTheater({ name: 'Village Road' });

      const response = await api()
        .patch(`/api/theaters/${theater.id}`)
        .send({ name: 'VILLAGE ROAD' });

      expect(response.status).toBe(200);
      expect(response.body.data.name).toBe('VILLAGE ROAD');
    });
  });

  describe('GET /api/theaters', () => {
    it('paginates the theater directory', async () => {
      await createTheater({ name: 'Cinema A' });
      await createTheater({ name: 'Cinema B' });
      await createTheater({ name: 'Cinema C' });

      const response = await api().get('/api/theaters').query({ page: 1, limit: 2 });

      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });
      expect(response.body.data.items).toHaveLength(2);
    });

    it('filters by isActive and search', async () => {
      await createTheater({ name: 'Open Cinema' });
      await createTheater({ name: 'Shut Cinema', isActive: false });

      const active = await api().get('/api/theaters').query({ isActive: 'true' });
      expect(active.body.data.items).toHaveLength(1);
      expect(active.body.data.items[0].name).toBe('Open Cinema');

      const search = await api().get('/api/theaters').query({ search: 'shut' });
      expect(search.body.data.items).toHaveLength(1);
    });
  });
});
