import { Request, Response } from 'express';
import { DriverStatus, Prisma, Role } from '@prisma/client';
import prisma from '../lib/prisma';

const VALID_DRIVER_STATUSES = new Set<string>(Object.values(DriverStatus));

const DRIVER_INCLUDE = {
  driverProfile: true,
  trips: {
    where: { status: { in: ['ASSIGNED', 'IN_TRANSIT'] } },
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      tripCode: true,
      status: true,
      _count: {
        select: { orders: true },
      },
    },
  },
  _count: {
    select: { trips: true },
  },
} satisfies Prisma.UserInclude;

type DriverWithRelations = Prisma.UserGetPayload<{
  include: typeof DRIVER_INCLUDE;
}>;

function serializeDriver(user: DriverWithRelations) {
  const activeTrip = user.trips[0] ?? null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.driverProfile?.phone ?? '',
    vehicleType: user.driverProfile?.vehicleType ?? 'Xe máy',
    licensePlate: user.driverProfile?.licensePlate ?? '',
    status: user.driverProfile?.status ?? DriverStatus.AVAILABLE,
    isActive: user.driverProfile?.isActive ?? true,
    notes: user.driverProfile?.notes ?? '',
    activeTrip: activeTrip
      ? {
          id: activeTrip.id,
          tripCode: activeTrip.tripCode,
          status: activeTrip.status,
          ordersCount: activeTrip._count.orders,
        }
      : null,
    totalTrips: user._count.trips,
    createdAt: user.createdAt,
    updatedAt: user.driverProfile?.updatedAt ?? user.createdAt,
  };
}

export const getDrivers = async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';
    const vehicleType =
      typeof req.query.vehicleType === 'string' ? req.query.vehicleType.trim() : '';
    const activeOnly = req.query.activeOnly === 'true';
    const availableOnly = req.query.availableOnly === 'true';

    const hasPagination =
      req.query.page !== undefined || req.query.limit !== undefined;
    const rawPage = Number(req.query.page ?? 1);
    const rawLimit = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(100, Math.max(1, Math.floor(rawLimit)))
      : 20;
    const requestedPage = Number.isFinite(rawPage)
      ? Math.max(1, Math.floor(rawPage))
      : 1;

    const profileFilter: Prisma.DriverProfileWhereInput = {};
    if (activeOnly || availableOnly) {
      profileFilter.isActive = true;
    }
    if (availableOnly) {
      profileFilter.status = DriverStatus.AVAILABLE;
    } else if (status && status !== 'ALL' && VALID_DRIVER_STATUSES.has(status)) {
      profileFilter.status = status as DriverStatus;
    }
    if (vehicleType && vehicleType !== 'ALL') {
      profileFilter.vehicleType = vehicleType;
    }

    const where: Prisma.UserWhereInput = {
      role: Role.DRIVER,
    };

    if (Object.keys(profileFilter).length > 0) {
      where.driverProfile = { is: profileFilter };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { driverProfile: { is: { phone: { contains: search, mode: 'insensitive' } } } },
        { driverProfile: { is: { licensePlate: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [total, totalDrivers, availableDrivers, onDeliveryDrivers, inactiveDrivers] =
      await Promise.all([
        prisma.user.count({ where }),
        prisma.user.count({ where: { role: Role.DRIVER } }),
        prisma.user.count({
          where: {
            role: Role.DRIVER,
            driverProfile: { is: { isActive: true, status: DriverStatus.AVAILABLE } },
          },
        }),
        prisma.user.count({
          where: {
            role: Role.DRIVER,
            driverProfile: { is: { status: DriverStatus.ON_DELIVERY } },
          },
        }),
        prisma.user.count({
          where: {
            role: Role.DRIVER,
            driverProfile: { is: { isActive: false } },
          },
        }),
      ]);

    const totalPages = hasPagination ? Math.max(1, Math.ceil(total / limit)) : 1;
    const page = hasPagination ? Math.min(requestedPage, totalPages) : 1;

    const drivers = await prisma.user.findMany({
      where,
      include: DRIVER_INCLUDE,
      orderBy: [{ id: 'desc' }],
      ...(hasPagination
        ? {
            skip: (page - 1) * limit,
            take: limit,
          }
        : {}),
    });

    res.json({
      success: true,
      data: drivers.map(serializeDriver),
      pagination: {
        page,
        limit: hasPagination ? limit : total,
        total,
        totalPages,
      },
      summary: {
        totalDrivers,
        availableDrivers,
        onDeliveryDrivers,
        inactiveDrivers,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getDriverById = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID tài xế không hợp lệ.' });
    }

    const driver = await prisma.user.findFirst({
      where: { id, role: Role.DRIVER },
      include: DRIVER_INCLUDE,
    });
    if (!driver) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế.' });
    }

    res.json({ success: true, data: serializeDriver(driver) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createDriver = async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      vehicleType,
      licensePlate,
      status = DriverStatus.AVAILABLE,
      isActive = true,
      notes,
    } = req.body;

    const trimmedName = typeof name === 'string' ? name.trim() : '';
    const trimmedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const trimmedPassword =
      typeof password === 'string' && password.trim() ? password.trim() : '123';
    const trimmedPhone = typeof phone === 'string' ? phone.trim() : '';
    const trimmedVehicleType =
      typeof vehicleType === 'string' && vehicleType.trim() ? vehicleType.trim() : 'Xe máy';
    const trimmedPlate =
      typeof licensePlate === 'string' ? licensePlate.trim().toUpperCase() : '';
    const trimmedNotes = typeof notes === 'string' && notes.trim() ? notes.trim() : null;

    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập họ tên tài xế.' });
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập email hợp lệ.' });
    }
    if (!trimmedPhone) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập số điện thoại tài xế.' });
    }
    if (!trimmedPlate) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập biển số xe.' });
    }

    const parsedIsActive = Boolean(isActive);
    let parsedStatus: DriverStatus = VALID_DRIVER_STATUSES.has(status)
      ? (status as DriverStatus)
      : DriverStatus.AVAILABLE;
    if (!parsedIsActive && parsedStatus !== DriverStatus.ON_DELIVERY) {
      parsedStatus = DriverStatus.OFFLINE;
    }

    const existingEmail = await prisma.user.findUnique({ where: { email: trimmedEmail } });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: `Email "${trimmedEmail}" đã được sử dụng. Vui lòng chọn email khác.`,
      });
    }

    const created = await prisma.user.create({
      data: {
        name: trimmedName,
        email: trimmedEmail,
        password: trimmedPassword,
        role: Role.DRIVER,
        driverProfile: {
          create: {
            phone: trimmedPhone,
            vehicleType: trimmedVehicleType,
            licensePlate: trimmedPlate,
            status: parsedStatus,
            isActive: parsedIsActive,
            notes: trimmedNotes,
          },
        },
      },
      include: DRIVER_INCLUDE,
    });

    res.status(201).json({
      success: true,
      message: `Đã thêm tài xế "${created.name}" thành công!`,
      data: serializeDriver(created),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateDriver = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID tài xế không hợp lệ.' });
    }

    const existing = await prisma.user.findFirst({
      where: { id, role: Role.DRIVER },
      include: DRIVER_INCLUDE,
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế.' });
    }

    const {
      name,
      email,
      password,
      phone,
      vehicleType,
      licensePlate,
      status,
      isActive,
      notes,
    } = req.body;

    const trimmedName = typeof name === 'string' ? name.trim() : existing.name;
    const trimmedEmail =
      typeof email === 'string' ? email.trim().toLowerCase() : existing.email;
    const trimmedPhone =
      typeof phone === 'string' ? phone.trim() : existing.driverProfile?.phone ?? '';
    const trimmedVehicleType =
      typeof vehicleType === 'string' && vehicleType.trim()
        ? vehicleType.trim()
        : existing.driverProfile?.vehicleType ?? 'Xe máy';
    const trimmedPlate =
      typeof licensePlate === 'string'
        ? licensePlate.trim().toUpperCase()
        : existing.driverProfile?.licensePlate ?? '';
    const trimmedNotes =
      notes !== undefined
        ? typeof notes === 'string' && notes.trim()
          ? notes.trim()
          : null
        : existing.driverProfile?.notes ?? null;

    if (!trimmedName) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập họ tên tài xế.' });
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập email hợp lệ.' });
    }
    if (!trimmedPhone) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập số điện thoại tài xế.' });
    }
    if (!trimmedPlate) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập biển số xe.' });
    }

    if (trimmedEmail !== existing.email) {
      const duplicate = await prisma.user.findUnique({ where: { email: trimmedEmail } });
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Email "${trimmedEmail}" đã được sử dụng. Vui lòng chọn email khác.`,
        });
      }
    }

    const nextIsActive =
      isActive !== undefined ? Boolean(isActive) : existing.driverProfile?.isActive ?? true;
    let nextStatus: DriverStatus =
      typeof status === 'string' && VALID_DRIVER_STATUSES.has(status)
        ? (status as DriverStatus)
        : existing.driverProfile?.status ?? DriverStatus.AVAILABLE;

    if (!nextIsActive && nextStatus !== DriverStatus.ON_DELIVERY) {
      nextStatus = DriverStatus.OFFLINE;
    } else if (
      nextIsActive &&
      existing.driverProfile?.isActive === false &&
      status === undefined &&
      nextStatus === DriverStatus.OFFLINE
    ) {
      nextStatus = DriverStatus.AVAILABLE;
    }

    const userUpdateData: Prisma.UserUpdateInput = {
      name: trimmedName,
      email: trimmedEmail,
      driverProfile: {
        upsert: {
          create: {
            phone: trimmedPhone,
            vehicleType: trimmedVehicleType,
            licensePlate: trimmedPlate,
            status: nextStatus,
            isActive: nextIsActive,
            notes: trimmedNotes,
          },
          update: {
            phone: trimmedPhone,
            vehicleType: trimmedVehicleType,
            licensePlate: trimmedPlate,
            status: nextStatus,
            isActive: nextIsActive,
            notes: trimmedNotes,
          },
        },
      },
    };

    if (typeof password === 'string' && password.trim()) {
      userUpdateData.password = password.trim();
    }

    const updated = await prisma.user.update({
      where: { id },
      data: userUpdateData,
      include: DRIVER_INCLUDE,
    });

    res.json({
      success: true,
      message: `Đã cập nhật tài xế "${updated.name}" thành công!`,
      data: serializeDriver(updated),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteDriver = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID tài xế không hợp lệ.' });
    }

    const existing = await prisma.user.findFirst({
      where: { id, role: Role.DRIVER },
      include: DRIVER_INCLUDE,
    });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy tài xế.' });
    }

    const activeTripsCount = await prisma.trip.count({
      where: {
        driverId: id,
        status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
      },
    });

    if (activeTripsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Không thể xóa tài xế "${existing.name}" vì đang có ${activeTripsCount} chuyến giao hàng hoạt động. Hãy hoàn tất chuyến hoặc tạm ngưng tài xế.`,
      });
    }

    await prisma.$transaction([
      prisma.trip.updateMany({
        where: { driverId: id },
        data: { driverId: null },
      }),
      prisma.user.delete({
        where: { id },
      }),
    ]);

    res.json({
      success: true,
      message: `Đã xóa tài xế "${existing.name}" thành công!`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
