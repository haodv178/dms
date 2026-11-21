import { Router } from 'express';
import {
  createStore,
  deleteStore,
  getStoreById,
  getStoreInventory,
  getStores,
  setDefaultStore,
  updateStore,
  updateStoreInventory,
} from '../controllers/store.controller';

const router = Router();

router.get('/', getStores);
router.get('/:id/inventory', getStoreInventory);
router.put('/:id/inventory', updateStoreInventory);
router.get('/:id', getStoreById);
router.post('/', createStore);
router.put('/:id', updateStore);
router.patch('/:id/set-default', setDefaultStore);
router.delete('/:id', deleteStore);

export default router;
