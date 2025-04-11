import { Router } from 'express';
import { cacheManager } from '../utils/cacheManager';

const router = Router();

/**
 * GET /api/cache/status
 * Returns cache status information
 */
router.get('/status', (req, res) => {
  try {
    const status = {
      size: cacheManager.size(),
      keys: cacheManager.keys(),
      timestamp: new Date().toISOString()
    };
    
    res.json(status);
  } catch (error) {
    console.error('Error fetching cache status:', error);
    res.status(500).json({ error: 'Failed to get cache status' });
  }
});

/**
 * DELETE /api/cache/clear
 * Clears the entire cache
 */
router.delete('/clear', (req, res) => {
  try {
    const previousSize = cacheManager.size();
    cacheManager.clear();
    
    res.json({
      success: true,
      message: `Cache cleared. Removed ${previousSize} items.`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

/**
 * DELETE /api/cache/item/:key
 * Removes a specific item from the cache
 */
router.delete('/item/:key', (req, res) => {
  try {
    const key = req.params.key;
    const existed = cacheManager.keys().includes(key);
    
    if (existed) {
      cacheManager.delete(key);
      res.json({
        success: true,
        message: `Deleted cache item: ${key}`,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        message: `Cache item not found: ${key}`,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error deleting cache item:', error);
    res.status(500).json({ error: 'Failed to delete cache item' });
  }
});

/**
 * POST /api/cache/gc
 * Manually triggers garbage collection
 */
router.post('/gc', (req, res) => {
  try {
    const removed = cacheManager.garbageCollect();
    
    res.json({
      success: true,
      removed,
      message: `Garbage collection removed ${removed} expired items.`,
      currentSize: cacheManager.size(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error running garbage collection:', error);
    res.status(500).json({ error: 'Failed to run garbage collection' });
  }
});

export default router;